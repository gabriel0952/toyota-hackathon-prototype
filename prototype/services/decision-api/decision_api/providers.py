"""Replaceable source boundaries. Every value here is an engineering fixture."""
from typing import Protocol


class VehicleKnowledgeProvider(Protocol):
    def get(self) -> dict: ...


class ChargingProvider(Protocol):
    def query(self, area: str, connector: str, window: str) -> dict: ...


class CostParameterProvider(Protocol):
    def get(self, home: bool) -> dict: ...


class SeedVehicle:
    def __init__(self, rules): self.rules = rules
    def get(self):
        return {'id': 'vehicle-engineering-v1', 'connector': 'CCS2',
                'range': self.rules['usableRangeKm'], 'energy': self.rules['energyKwhPer100Km'],
                'sourceTime': self.rules['seedUpdatedAt'], 'label': '車規工程假設（非特定年式 bZ4X 官方數值）'}


class SeedCharging:
    def query(self, area, connector, window):
        # Explicit coverage, never interpret arbitrary place text as Taipei.
        areas = {'台北市內湖區', '台北市南港區', '台中市西屯區', '示範無站區'}
        if area not in areas:
            return {'id': 'stations-seed-v1', 'status': 'no_data', 'stations': [], 'area': area, 'connector': connector, 'window': window, 'resolvedAreaCode': {'台北市內湖區':'63000100','台北市南港區':'63000090','台中市西屯區':'66000060','示範無站區':'test-empty'}.get(area), 'sourceTime':'2026-09-22T00:00:00Z'}
        candidates = [] if area == '示範無站區' else [
            {'id': f'{area}-seed-a', 'connectorId': 'a-1', 'connector': 'CCS2', 'windows': ['day', 'night']},
            {'id': f'{area}-seed-b', 'connectorId': 'b-1', 'connector': 'CCS2', 'windows': ['day']},
        ]
        candidates = [s for s in candidates if s['connector'] == connector and window in s['windows']]
        return {'id': 'stations-seed-v1', 'status': 'available' if candidates else 'no_nearby_station',
                'stations': candidates, 'area': area, 'connector': connector, 'window': window, 'resolvedAreaCode': {'台北市內湖區':'63000100','台北市南港區':'63000090','台中市西屯區':'66000060','示範無站區':'test-empty'}.get(area), 'sourceTime':'2026-09-22T00:00:00Z'}


class SeedCost:
    def __init__(self, rules): self.rules = rules
    def get(self, home):
        return {'id': 'prices-engineering-v1', 'prices': self.rules['homePriceTwdPerKwh' if home else 'publicPriceTwdPerKwh'],
                'loss': self.rules['chargingLossFraction'], 'sourceTime': self.rules['seedUpdatedAt']}


class TemplateComposer:
    def compose(self, route):
        return {
            'ready': ('green', '可立即轉電', '穩定補電與行程條件已通過示範規則'),
            'home_install_required': ('yellow', '裝樁後可轉', '先落實已初評的家充方案，再確認轉電安排'),
            'public_charging_ready': ('yellow', '公共充電可轉', '公共補電方案可支撐，仍需落實日常安排'),
            'not_ready': ('gray', '暫不建議轉電', '已知補電或行程限制尚未解決'),
            None: (None, '資料待確認', '先補齊關鍵條件，再判斷轉電路徑'),
        }[route]
