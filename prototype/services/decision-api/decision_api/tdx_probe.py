"""Explicit local G0 probe. Outputs raw data only to the requested local folder."""
import argparse
import asyncio
import json
import os
from pathlib import Path
from .grounded.tdx import TdxClient, TdxFailure, DATASETS


def load_environment(path):
    # Deliberately not a shell evaluator: no substitutions, commands, or execution.
    allowed = {'TDX_CLIENT_ID','TDX_CLIENT_SECRET','GEMINI_API_KEY','LLM_PROVIDER','LLM_MODEL',
               'LLM_MAX_COST_USD','LLM_TEST_BUDGET_USD','LLM_MAX_TOKENS','GENERATION_MODE',
               'DECISION_DB','DECISION_SOURCE_MODE','LOCAL_DEMO','GEMINI_FREE_TIER_CONFIRMED'}
    result = {}
    if path:
        for line in Path(path).read_text().splitlines():
            line=line.strip()
            if not line or line.startswith('#'): continue
            key, separator, value = line.partition('=')
            key, value = key.strip(), value.strip()
            if not separator or key not in allowed: continue
            if value[:1] in ('"', "'"):
                if len(value) < 2 or value[-1] != value[0]: raise ValueError('Invalid environment file quoting')
                value=value[1:-1]
            result[key]=value
    result.update({key: os.environ[key] for key in allowed if key in os.environ})
    return result


async def probe(config, output, datasets):
    client=TdxClient(config.get('TDX_CLIENT_ID'),config.get('TDX_CLIENT_SECRET'))
    output.mkdir(parents=True,exist_ok=True)
    summaries=[]
    for dataset in datasets:
        try:
            snapshot=await client.fetch(dataset)
            path=output/(snapshot.snapshotId+'.json')
            path.write_text(snapshot.model_dump_json(indent=2))
            path.chmod(0o600)
            pages=snapshot.payload['pages']
            summaries.append({'dataset':dataset,'coverage':snapshot.coverage,
                              'pages':len(pages),'records':sum(len(p[DATASETS[dataset]]) for p in pages),
                              'snapshotId':snapshot.snapshotId,'sourceUpdatedAt':str(snapshot.sourceUpdatedAt)})
        except TdxFailure as exc:
            summaries.append({'dataset':dataset,'error':str(exc)})
    return summaries


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--env-file')
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--dataset', action='append', choices=sorted(DATASETS))
    args=parser.parse_args()
    try:
        result=asyncio.run(probe(load_environment(args.env_file),args.output,args.dataset or list(DATASETS)))
        print(json.dumps(result,ensure_ascii=False,indent=2))
    except (ValueError,OSError):
        parser.exit(2,'設定缺漏或無法讀取；請檢查本機環境檔與輸出目錄。\n')


if __name__=='__main__': main()
