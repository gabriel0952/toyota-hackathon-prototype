"""Explicit source refresh only: never publishes or updates personal reports."""
import argparse
import asyncio
import json
from pathlib import Path
from .repository import Repository
from .tdx_probe import load_environment
from .grounded.contracts import SourceEnvelope
from .grounded.tdx import TdxClient, TdxFailure
from .grounded.normalize import normalize_stations, AREA


def import_recorded(repo, directory):
    latest={}
    for path in directory.glob('source-*.json'):
        source=SourceEnvelope.model_validate_json(path.read_text())
        dataset=source.query.get('dataset')
        if dataset:
            repo.save_source(source,'tdx:raw:'+dataset)
            if dataset not in latest or source.retrievedAt>latest[dataset].retrievedAt:
                latest[dataset]=source
    normalized=normalize_stations(*(latest[k] for k in ('Station','Connector','ServiceTime')))
    repo.save_source(normalized,'tdx:normalized:'+AREA)
    return normalized


async def refresh(repo, config):
    client=TdxClient(config.get('TDX_CLIENT_ID'),config.get('TDX_CLIENT_SECRET'))
    sources={}
    for dataset in ('Station','Connector','ServiceTime','ConnectorLiveStatus'):
        try:
            source=await client.fetch(dataset)
            repo.save_source(source,'tdx:raw:'+dataset)
            sources[dataset]=source
        except TdxFailure:
            if dataset!='ConnectorLiveStatus':raise
    normalized=normalize_stations(*(sources[k] for k in ('Station','Connector','ServiceTime')))
    repo.save_source(normalized,'tdx:normalized:'+AREA)
    return normalized


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--db',required=True)
    parser.add_argument('--env-file')
    parser.add_argument('--import-directory',type=Path)
    args=parser.parse_args()
    try:
        repo=Repository(args.db)
        result=import_recorded(repo,args.import_directory) if args.import_directory else asyncio.run(refresh(repo,load_environment(args.env_file)))
        print(json.dumps({'snapshotId':result.snapshotId,'coverage':result.coverage,
                          'stations':len(result.payload['stations']),'missingFields':result.missingFields},ensure_ascii=False))
    except (KeyError,ValueError,OSError,ConnectionError):
        parser.exit(2,'來源更新未完成，既有個人報告與先前快照保留；請檢查來源及設定。\n')


if __name__=='__main__':main()
