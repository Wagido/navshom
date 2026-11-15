#!/usr/bin/env bash
# Télécharge les données brutes (Eurostat + INSEE) dans data/sources/.
# Usage : bash scripts/fetch.sh   (depuis le dossier finances/)
set -euo pipefail
cd "$(dirname "$0")/../data/sources"
E="https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data"
get() { echo "→ $1"; curl -fsSL --retry 3 -A "Mozilla/5.0" "$2" -o "$1"; }

# PIB : demande, revenus, valeur ajoutée par branche et par secteur, population
get nama_10_gdp.json    "$E/nama_10_gdp?geo=FR&unit=CP_MEUR&sinceTimePeriod=2015"
get nama_10_a10.json    "$E/nama_10_a10?geo=FR&unit=CP_MEUR&na_item=B1G&sinceTimePeriod=2015"
get nasa_10_nf_tr.json  "$E/nasa_10_nf_tr?geo=FR&unit=CP_MEUR&sinceTimePeriod=2015&na_item=B1G&na_item=P51C&na_item=P1&na_item=P2&na_item=B2A3G&na_item=D1&na_item=P3&na_item=P51G"
get nama_10_co3_p3.json "$E/nama_10_co3_p3?geo=FR&unit=CP_MEUR&sinceTimePeriod=2015&coicop=CP041&coicop=CP042&coicop=TOTAL"
get nama_10_pe.json     "$E/nama_10_pe?geo=FR&unit=THS_PER&na_item=POP_NC&sinceTimePeriod=2015"

# Administrations publiques : comptes, impôts détaillés, dépenses par fonction (COFOG)
get gov_10a_main.json   "$E/gov_10a_main?geo=FR&unit=MIO_EUR&sinceTimePeriod=2015"
get gov_10a_taxag.json  "$E/gov_10a_taxag?geo=FR&unit=MIO_EUR&sinceTimePeriod=2015"
get gov_10a_exp.json    "$E/gov_10a_exp?geo=FR&unit=MIO_EUR&na_item=TE&sinceTimePeriod=2015"

# Patrimoine : actifs non financiers et comptes financiers par secteur
get nama_10_nfa_bs.json "$E/nama_10_nfa_bs?geo=FR&unit=CP_MEUR&sinceTimePeriod=2015"
get nasa_10_f_bs.json   "$E/nasa_10_f_bs?geo=FR&unit=MIO_EUR&co_nco=NCO&sinceTimePeriod=2015"

# Dette publique au sens de Maastricht (en % du PIB)
get gov_10dd_edpt1.json "$E/gov_10dd_edpt1?geo=FR&unit=PC_GDP&na_item=GD&sector=S13&sinceTimePeriod=2015"

# INSEE : comptes nationaux distribués 2023 (Insee Analyses n° 118)
get insee_IA118.xlsx    "https://www.insee.fr/fr/statistiques/fichier/8974371/IA118.xlsx"
echo "OK"
