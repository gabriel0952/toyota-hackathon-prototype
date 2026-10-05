"""Deterministic ownership-cost comparison for the demonstration report."""

CURRENT_PRESETS = {
    'ALTIS': {'maintenance': 15200, 'tax': 11920, 'fuelEfficiency': 15.6},
    'COROLLA CROSS': {'maintenance': 14800, 'tax': 11920, 'fuelEfficiency': 14.9},
    'CAMRY': {'maintenance': 18756, 'tax': 17440, 'fuelEfficiency': 12.0},
    'RAV4': {'maintenance': 18500, 'tax': 17440, 'fuelEfficiency': 13.8},
    'YARIS': {'maintenance': 13200, 'tax': 11920, 'fuelEfficiency': 16.5},
    'VIOS': {'maintenance': 13200, 'tax': 11920, 'fuelEfficiency': 16.5},
    'SIENTA': {'maintenance': 15800, 'tax': 11920, 'fuelEfficiency': 14.6},
}

REPLACEMENT_PRESETS = {
    'RAV4 2.0': {'price': 1010000, 'maintenance': 14000, 'tax': 17440, 'fuelEfficiency': 15.3},
    'COROLLA CROSS 1.8': {'price': 850000, 'maintenance': 12500, 'tax': 11920, 'fuelEfficiency': 14.9},
    'CAMRY 2.0': {'price': 980000, 'maintenance': 14500, 'tax': 17440, 'fuelEfficiency': 16.2},
    'RAV4 HYBRID': {'price': 1150000, 'maintenance': 13500, 'tax': 17440, 'fuelEfficiency': 22.6},
}


def _value(fields, key, fallback=None):
    item = fields.get(key, {})
    return item.get('value') if item.get('status') == 'provided' else fallback


def _current_preset(vehicle):
    name = str(vehicle or '').upper()
    for key, preset in CURRENT_PRESETS.items():
        if key in name:
            return preset
    return {'maintenance': 16000, 'tax': 11920, 'fuelEfficiency': 14.0}


def _crossing_year(ev, other):
    if ev[0] <= other[0]:
        return 0.0
    for year in range(1, min(len(ev), len(other))):
        before = ev[year - 1] - other[year - 1]
        after = ev[year] - other[year]
        if before > 0 and after <= 0:
            span = before - after
            return round((year - 1) + (before / span if span else 0), 2)
    return None


def calculate_tco(fields, rules):
    # Old stored rule snapshots omit this section; returning None preserves replay.
    if 'tco' not in rules:
        return None
    monthly_mileage = _value(fields, 'monthlyMileage')
    if monthly_mileage is None:
        return {'status': 'unavailable', 'note': '缺少每月里程，暫時無法比較累積持有成本。'}

    cfg = rules['tco']
    annual_mileage = float(monthly_mileage) * 12
    vehicle = _value(fields, 'vehicle', '')
    current = _current_preset(vehicle)
    age = float(_value(fields, 'vehicleAge', _value(fields, 'ownershipYears', 0)) or 0)
    fuel_efficiency = float(_value(fields, 'fuelEfficiencyKmPerL', current['fuelEfficiency']) or current['fuelEfficiency'])
    monthly_fuel = _value(fields, 'monthlyCost')
    annual_current_energy = float(monthly_fuel) * 12 if monthly_fuel is not None else annual_mileage / fuel_efficiency * cfg['gasPriceTwdPerL']

    supplied_home_share = _value(fields, 'homeChargingPercent')
    if supplied_home_share is None:
        method = str(_value(fields, 'chargingMethod', ''))
        supplied_home_share = 80 if _value(fields, 'homeCharging') == 'available' or '住家' in method else 0 if ('公司' in method or '公共' in method) else cfg['defaultHomeChargingPercent']
    home_share = min(100, max(0, float(supplied_home_share))) / 100
    home_rate = sum(rules['homePriceTwdPerKwh']) / len(rules['homePriceTwdPerKwh'])
    public_rate = sum(rules['publicPriceTwdPerKwh']) / len(rules['publicPriceTwdPerKwh'])
    weighted_rate = home_rate * home_share + public_rate * (1 - home_share)
    annual_ev_energy = annual_mileage * rules['energyKwhPer100Km'] / 100 / (1 - rules['chargingLossFraction']) * weighted_rate

    replacement_name = str(_value(fields, 'replacementVehicle', 'RAV4 2.0'))
    replacement = REPLACEMENT_PRESETS.get(replacement_name, REPLACEMENT_PRESETS['RAV4 2.0'])
    annual_new_energy = annual_mileage / replacement['fuelEfficiency'] * cfg['gasPriceTwdPerL']
    trade_in = max(0, float(_value(fields, 'estimatedTradeInValue', 0) or 0))
    charger_cost = max(0, float(_value(fields, 'homeChargerCost', 0) or 0))
    planned_years = int(_value(fields, 'plannedOwnershipYears', 5) or 5)

    initial = {
        'current': 0,
        'newIce': max(0, replacement['price'] - trade_in),
        'bz4x': max(0, cfg['bz4xPriceTwd'] - trade_in) + charger_cost,
    }
    curves = {key: [round(value)] for key, value in initial.items()}
    totals = {key: {'purchase': initial[key], 'energy': 0, 'maintenance': 0, 'tax': 0} for key in initial}
    five_year_breakdown = None
    for year in range(1, 11):
        current_maintenance = current['maintenance'] * (1 + max(age + year - 1 - 5, 0) * cfg['currentMaintenanceAgeRate']) * (1.02 ** (year - 1))
        new_maintenance = replacement['maintenance'] * (1.015 ** (year - 1))
        annual = {
            'current': (annual_current_energy, current_maintenance, current['tax']),
            'newIce': (annual_new_energy, new_maintenance, replacement['tax']),
            'bz4x': (annual_ev_energy, cfg['bz4xAnnualMaintenanceTwd'], cfg['bz4xAnnualTaxTwd']),
        }
        for key, (energy, maintenance, tax) in annual.items():
            totals[key]['energy'] += energy
            totals[key]['maintenance'] += maintenance
            totals[key]['tax'] += tax
            curves[key].append(round(sum(totals[key].values())))
        if year == 5:
            five_year_breakdown = {key: {part: round(value) for part, value in values.items()} for key, values in totals.items()}

    five_year = {key: curves[key][5] for key in curves}
    energy_saving_rate = 0 if annual_current_energy <= 0 else (annual_current_energy - annual_ev_energy) / annual_current_energy * 100
    return {
        'status': 'estimated', 'version': cfg['version'],
        'note': '情境試算；不含貸款、保險、期末殘值及未提供的停車或服務費。',
        'comparisonVehicle': replacement_name, 'plannedOwnershipYears': planned_years,
        'breakEvenVsNewIceYears': _crossing_year(curves['bz4x'], curves['newIce']),
        'breakEvenVsKeepYears': _crossing_year(curves['bz4x'], curves['current']),
        'fiveYearSavingsVsNewIce': round(five_year['newIce'] - five_year['bz4x']),
        'fiveYearSavingsVsKeep': round(five_year['current'] - five_year['bz4x']),
        'annualEnergySavingsRate': round(energy_saving_rate, 1),
        'annualEnergyCost': {'current': round(annual_current_energy), 'newIce': round(annual_new_energy), 'bz4x': round(annual_ev_energy)},
        'curves': {'years': list(range(11)), **curves}, 'fiveYearBreakdown': five_year_breakdown,
        'inputs': {'annualMileage': round(annual_mileage), 'vehicleAge': age, 'fuelEfficiencyKmPerL': fuel_efficiency,
                   'homeChargingPercent': round(home_share * 100), 'weightedElectricityRate': round(weighted_rate, 2),
                   'tradeInValue': round(trade_in), 'homeChargerCost': round(charger_cost)},
        'inputSources': {
            'monthlyMileage': 'user', 'monthlyFuelCost': 'user' if monthly_fuel is not None else 'model_assumption',
            'vehicleAge': 'user' if _value(fields, 'vehicleAge') is not None else 'ownership_years_fallback',
            'fuelEfficiency': 'user' if _value(fields, 'fuelEfficiencyKmPerL') is not None else 'model_assumption',
            'homeChargingPercent': 'user' if _value(fields, 'homeChargingPercent') is not None else 'derived_from_charging_method',
            'tradeInValue': 'user' if _value(fields, 'estimatedTradeInValue') is not None else 'not_provided',
        },
    }
