from enum import Enum


class FuelType(str, Enum):
    GASOLINE = "essence"
    DIESEL = "diesel"
    ELECTRIC = "electrique"
    HYBRID = "hybride"
    LPG = "gpl"
    E85 = "e85"
    SP98 = "sp98"
