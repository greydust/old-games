"""HR trade tables and integer price calculation. Evidence: HR_FORMAT.md."""
import struct


def trade_price(base, multiplier, trading):
    adjusted = base * multiplier // 100
    buy = max(1, adjusted - adjusted * trading // 200)
    discounted = adjusted * 8 // 10
    sell = max(1, min(buy, discounted + discounted * trading // 200))
    return buy, sell


def markets(exe, locations):
    result = []
    for location in locations:
        market = exe[0x352db + location['id'] * 101 + 39]
        if market == 255:
            continue
        goods = []
        for i in range(12):
            multiplier, auxiliary, replenishment, stock = struct.unpack_from(
                '<BBBH', exe, 0x3bf0f + market * 60 + i * 5)
            goods.append(dict(goodId=i, multiplier=multiplier,
                              initialStock=stock // 24))
        result.append(dict(name=location['name'], goods=goods))
    assert len(result) == 57
    return result
