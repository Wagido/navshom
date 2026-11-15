#!/usr/bin/env bash
# Télécharge les données brutes (Eurostat + INSEE) dans data/sources/.
# Usage : bash scripts/fetch.sh   (depuis le dossier finances/)
set -euo pipefail
SCRIPTS="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPTS/../data/sources"
E="https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data"
get() { echo "→ $1"; curl -fsSL --retry 3 -A "Mozilla/5.0" "$2" -o "$1"; }

# PIB : demande, revenus, valeur ajoutée par branche et par secteur, population
get nama_10_gdp.json    "$E/nama_10_gdp?geo=FR&unit=CP_MEUR&sinceTimePeriod=1995"
get nama_10_a10.json    "$E/nama_10_a10?geo=FR&unit=CP_MEUR&na_item=B1G&sinceTimePeriod=2015"
get nasa_10_nf_tr.json  "$E/nasa_10_nf_tr?geo=FR&unit=CP_MEUR&sinceTimePeriod=2015&na_item=B1G&na_item=P51C&na_item=P1&na_item=P2&na_item=B2A3G&na_item=D1&na_item=P3&na_item=P51G"
get nama_10_co3_p3.json "$E/nama_10_co3_p3?geo=FR&unit=CP_MEUR&sinceTimePeriod=2015&coicop=CP041&coicop=CP042&coicop=TOTAL"
get nama_10_pe.json     "$E/nama_10_pe?geo=FR&unit=THS_PER&na_item=POP_NC&sinceTimePeriod=2015"

# Administrations publiques : comptes, impôts détaillés, dépenses par fonction (COFOG)
get gov_10a_main.json   "$E/gov_10a_main?geo=FR&unit=MIO_EUR&sinceTimePeriod=1995"
get gov_10a_taxag.json  "$E/gov_10a_taxag?geo=FR&unit=MIO_EUR&sinceTimePeriod=2015"
get gov_10a_exp.json    "$E/gov_10a_exp?geo=FR&unit=MIO_EUR&na_item=TE&sector=S13&sector=S1311&sector=S1313&sector=S1314&sinceTimePeriod=1995"

# Patrimoine : actifs non financiers et comptes financiers par secteur
get nama_10_nfa_bs.json "$E/nama_10_nfa_bs?geo=FR&unit=CP_MEUR&sinceTimePeriod=2015"
get nasa_10_f_bs.json   "$E/nasa_10_f_bs?geo=FR&unit=MIO_EUR&co_nco=NCO&sinceTimePeriod=2015"

# Dette publique au sens de Maastricht (en % du PIB)
get gov_10dd_edpt1.json "$E/gov_10dd_edpt1?geo=FR&unit=PC_GDP&unit=MIO_EUR&na_item=GD&sector=S13&sinceTimePeriod=1995"

# INSEE : comptes nationaux distribués 2023 (Insee Analyses n° 118)
get insee_IA118.xlsx    "https://www.insee.fr/fr/statistiques/fichier/8974371/IA118.xlsx"
# Autres pays (sections PIB, simulateur et séries longues) : mêmes séries Eurostat,
# une requête par série pour tous les pays.
PAYS="BE BG CZ DK DE EE IE EL ES FR HR IT CY LV LT LU HU MT NL AT PL PT RO SI SK FI SE IS NO CH"
GEO=$(for g in $PAYS; do printf "&geo=%s" "$g"; done)
mkdir -p pays
get pays/nama_10_gdp.json    "$E/nama_10_gdp?unit=CP_MEUR&sinceTimePeriod=1995$GEO&na_item=B1GQ&na_item=B2A3G&na_item=D1&na_item=D2X3&na_item=P31_S14&na_item=P31_S15&na_item=P31_S13&na_item=P32_S13&na_item=P52_P53&na_item=P6X7&na_item=P6&na_item=P7"
get pays/nama_10_a10.json    "$E/nama_10_a10?unit=CP_MEUR&na_item=B1G&sinceTimePeriod=2015$GEO"
get pays/nasa_10_nf_tr.json  "$E/nasa_10_nf_tr?unit=CP_MEUR&sinceTimePeriod=2015$GEO&na_item=B1G&na_item=P51C&na_item=P51G&sector=S11&sector=S12&sector=S13&sector=S14&sector=S15&sector=S14_S15"
get pays/nama_10_co3_p3.json "$E/nama_10_co3_p3?unit=CP_MEUR&sinceTimePeriod=2010$GEO&coicop=CP042"
get pays/nama_10_pe.json     "$E/nama_10_pe?unit=THS_PER&na_item=POP_NC&sinceTimePeriod=2015$GEO"
get pays/gov_10a_main.json   "$E/gov_10a_main?unit=MIO_EUR&sector=S13&sinceTimePeriod=1995$GEO&na_item=TE&na_item=TR&na_item=D41PAY&na_item=P2&na_item=D632PAY&na_item=P51G&na_item=D3PAY"
get pays/gov_10a_taxag.json  "$E/gov_10a_taxag?unit=MIO_EUR&sector=S13&sinceTimePeriod=2015$GEO&na_item=D2_D5_D91_D61_M_D995"
get pays/gov_10a_exp.json    "$E/gov_10a_exp?unit=MIO_EUR&na_item=TE&sector=S13&sinceTimePeriod=1995$GEO"
get pays/nama_10_nfa_bs.json "$E/nama_10_nfa_bs?unit=CP_MEUR&sinceTimePeriod=2015$GEO&sector=S1&sector=S11&sector=S12&sector=S13&sector=S14_S15&asset10=N111N&asset10=N211N&asset10=N112N&asset10=N11MN&asset10=N117N&asset10=N12N&asset10=N13N&asset10=N1N&asset10=N2N"
get pays/nasa_10_f_bs.json   "$E/nasa_10_f_bs?unit=MIO_EUR&co_nco=NCO&sinceTimePeriod=2015$GEO&sector=S11&sector=S12&sector=S13&sector=S14_S15&sector=S2&na_item=F&na_item=F2&na_item=F3&na_item=F4&na_item=F5&na_item=F6"
get pays/gov_10dd_edpt1.json "$E/gov_10dd_edpt1?unit=PC_GDP&unit=MIO_EUR&na_item=GD&sector=S13&sinceTimePeriod=1995$GEO"
# Énergie : bilans Eurostat (GWh) et séries longues Our World in Data
mkdir -p energie
NB=$(for n in PPRD RCV_RCY IMP EXP STK_CHG GAE GIC INTMARB INTAVI TI_E TI_EHG_E TI_RPI_E TO TO_EHG TO_RPI NRG_E DL FC_NE FC_IND_E FC_TRA_E FC_OTH_HH_E FC_OTH_CP_E FC_OTH_AF_E FC_OTH_FISH_E FC_OTH_NSP_E STATDIFF FC_E FEC_EED PEC_EED GEP; do printf "&nrg_bal=%s" "$n"; done)
SI=$(for s in TOTAL C0000X0350-0370 C0350-0370 P1000 S2000 G3000 O4000XBIO O4100_TOT O4200 O4300 O4400X4410 O4500 N900H RA100 RA200 RA300 RA410 RA420 RA500 RA600 BIOE R5210P R5210B R5220P R5220B R5230P R5230B R5290 R5300 W6100_6220 E7000 H8000; do printf "&siec=%s" "$s"; done)
get energie/nrg_bal_c.json "$E/nrg_bal_c?unit=GWH&sinceTimePeriod=2015$GEO$NB$SI"
TMP=$(mktemp)
get "$TMP" "https://raw.githubusercontent.com/owid/energy-data/master/owid-energy-data.csv"
python3 "$SCRIPTS/filter_owid.py" "$TMP" energie/owid_europe.csv && rm -f "$TMP"
# Matières : comptes de flux de matières (Eurostat), en milliers de tonnes
mkdir -p matieres
MAT=$(for m in TOTAL MF1 MF11 MF12 MF13 MF14 MF15 MF16 MF2 MF21 MF22 MF221 MF227 MF228 MF23 MF3 MF31 MF32 MF34 MF35 MF36 MF37 MF38 MF3B MF4 MF41 MF42 MF43 MF44 MF45 MF5 MF6; do printf "&material=%s" "$m"; done)
get matieres/env_ac_mfa.json "$E/env_ac_mfa?sinceTimePeriod=2000&unit=THS_T&unit=T_HAB$GEO$MAT&indic_env=DE&indic_env=IMP&indic_env=EXP&indic_env=DMC"
get matieres/env_ac_sd.json  "$E/env_ac_sd?sinceTimePeriod=2010&unit=THS_T$GEO"
get matieres/env_ac_rme.json "$E/env_ac_rme?sinceTimePeriod=2010&unit=THS_T&unit=T_HAB$GEO&material=TOTAL&material=MF1&material=MF2&material=MF3&material=MF4"
get matieres/cei_srm030.json "$E/cei_srm030?sinceTimePeriod=2000$GEO"
echo "OK"
