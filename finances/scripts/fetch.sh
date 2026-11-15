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
# Thèmes : climat, eau, sols, démographie, immigration, temps de travail, justice (Eurostat)
mkdir -p themes
CRF=$(for c in TOTX4_MEMO TOTXMEMO CRF1A1 CRF1A2 CRF1A3 CRF1A4A CRF1A4B CRF1A4C CRF1A5 CRF1B CRF2 CRF3 CRF4 CRF5 CRF6 CRF1D1A CRF1D1B; do printf "&src_crf=%s" "$c"; done)
get themes/env_air_gge.json "$E/env_air_gge?unit=MIO_T&sinceTimePeriod=1990$GEO$CRF&airpol=GHG&airpol=CO2&airpol=CH4_CO2E&airpol=N2O_CO2E&airpol=HFC_PFC_NF3_SF6_CO2E"
get themes/env_wat_abs.json "$E/env_wat_abs?wat_src=FRW&sinceTimePeriod=2000$GEO"
get themes/lan_lcv_ovw.json "$E/lan_lcv_ovw?unit=KM2&unit=PC$GEO$(for c in TOTAL A00 A10 A20 A30 B00 C00 C10 C20 C30 D00 E00 F00 G00 H00; do printf "&landcover=%s" "$c"; done)"
get themes/lan_use_ovw.json "$E/lan_use_ovw?unit=KM2&unit=PC$GEO"
get themes/demo_gind.json   "$E/demo_gind?sinceTimePeriod=1960$GEO&indic_de=JAN&indic_de=LBIRTH&indic_de=DEATH&indic_de=CNMIGRAT&indic_de=GROW"
get themes/demo_pjan.json   "$E/demo_pjan?unit=NR&sex=M&sex=F&time=2000&time=2025$GEO"
get themes/proj_23np.json   "$E/proj_23np?projection=BSL&sex=T&unit=PER$GEO&age=TOTAL&age=Y_LT20&age=Y20-64&age=Y_GE65&age=Y_GE80"
get themes/migr_pop3ctb.json "$E/migr_pop3ctb?age=TOTAL&sex=T&sinceTimePeriod=2010$GEO&c_birth=TOTAL&c_birth=NAT&c_birth=FOR&c_birth=EU27_2020_FOR&c_birth=NEU27_2020_FOR"
get themes/migr_imm1ctz.json "$E/migr_imm1ctz?age=TOTAL&sex=T&agedef=COMPLET&sinceTimePeriod=2010$GEO&citizen=TOTAL&citizen=NAT&citizen=EU27_2020_FOR&citizen=NEU27_2020_FOR"
get themes/migr_emi1ctz.json "$E/migr_emi1ctz?age=TOTAL&sex=T&agedef=COMPLET&sinceTimePeriod=2010$GEO&citizen=TOTAL&citizen=NAT"
get themes/nama_10_a10_e.json "$E/nama_10_a10_e?na_item=EMP_DC&unit=THS_HW&unit=THS_PER&sinceTimePeriod=1995$GEO"
get themes/tus_00age.json   "$E/tus_00age?unit=TIME_SP&sex=T&age=TOTAL$GEO"
get themes/crim_off_cat.json "$E/crim_off_cat?sinceTimePeriod=2008$GEO"
get themes/crim_just_job.json "$E/crim_just_job?sex=T&sinceTimePeriod=2008$GEO"
get themes/crim_pris_cap.json "$E/crim_pris_cap?sinceTimePeriod=2008$GEO"

# Santé, éducation, logement, transports, emploi, inégalités, déchets (Eurostat)
mkdir -p societe
ICD=$(for c in TOTAL A_B C00-D48 E F G_H H60-H95 I J K M N P Q R V01-Y89 U071 X60-X84_Y870 V01-V99_Y85 C33_C34 C18-C21 C50 F01_F03 G30 I20-I25 I60-I69 J09-J18 J40-J47; do printf "&icd10=%s" "$c"; done)
get societe/demo_mlexpec.json "$E/demo_mlexpec?unit=YR&age=Y_LT1&age=Y65&sinceTimePeriod=1960$GEO"
get societe/hlth_cd_aro.json  "$E/hlth_cd_aro?unit=NR&sex=T&age=TOTAL&resid=TOT_IN&sinceTimePeriod=2011$GEO$ICD"
get societe/hlth_sha11_hchf.json "$E/hlth_sha11_hchf?unit=MIO_EUR&sinceTimePeriod=2014$GEO"
get societe/hlth_sha11_hf.json "$E/hlth_sha11_hf?unit=MIO_EUR&unit=PC_GDP&unit=EUR_HAB&sinceTimePeriod=2010$GEO"
get societe/educ_uoe_enra01.json "$E/educ_uoe_enra01?unit=NR&worktime=TOTAL&sex=T&sinceTimePeriod=2013$GEO"
get societe/educ_uoe_fini04.json "$E/educ_uoe_fini04?unit=EUR&unit=PPS&sector=TOT_SEC&sinceTimePeriod=2013$GEO"
get societe/edat_lfse_03.json "$E/edat_lfse_03?sex=T&age=Y25-64&age=Y25-34&unit=PC&sinceTimePeriod=2000$GEO"
get societe/ilc_lvho02.json   "$E/ilc_lvho02?rskpovth=TOTAL&hhcomp=TOTAL&unit=PC&sinceTimePeriod=2005$GEO"
get societe/ilc_lvho03.json   "$E/ilc_lvho03?unit=AVG&building=TOTAL&sinceTimePeriod=2005$GEO"
get societe/ilc_lvho05a.json  "$E/ilc_lvho05a?unit=PC&rskpovth=TOTAL&age=TOTAL&sex=T&sinceTimePeriod=2005$GEO"
get societe/ilc_lvho50a.json  "$E/ilc_lvho50a?unit=PC&rskpovth=TOTAL&age=TOTAL&sex=T&sinceTimePeriod=2005$GEO"
get societe/ilc_lvho07a.json  "$E/ilc_lvho07a?unit=PC&rskpovth=TOTAL&age=TOTAL&sex=T&sinceTimePeriod=2005$GEO"
get societe/prc_hpi_a.json    "$E/prc_hpi_a?purchase=TOTAL&unit=I15_A_AVG&sinceTimePeriod=2005$GEO"
get societe/prc_hicp_aind.json "$E/prc_hicp_aind?coicop=CP00&unit=INX_A_AVG&sinceTimePeriod=2005$GEO"
get societe/tran_hv_psmod.json "$E/tran_hv_psmod?unit=PC&sinceTimePeriod=1990$GEO"
get societe/tran_hv_frmod.json "$E/tran_hv_frmod?unit=PC&sinceTimePeriod=1990$GEO"
get societe/road_pa_mov.json  "$E/road_pa_mov?unit=MIO_PKM&sinceTimePeriod=1990$GEO"
get societe/rail_pa_total.json "$E/rail_pa_total?unit=MIO_PKM&sinceTimePeriod=1990$GEO"
get societe/avia_paoc.json    "$E/avia_paoc?freq=A&unit=PAS&tra_meas=PAS_CRD&schedule=TOTAL&tra_cov=TOTAL&tra_cov=NAT&tra_cov=INTL&sinceTimePeriod=2005$GEO"
get societe/road_go_ta_tott.json "$E/road_go_ta_tott?tra_type=TOTAL&tra_oper=TOTAL&unit=MIO_TKM&sinceTimePeriod=1990$GEO"
get societe/lfsa_pganws.json  "$E/lfsa_pganws?unit=THS_PER&sex=T&citizen=TOTAL&age=Y15-64&age=Y_GE15&sinceTimePeriod=2005$GEO"
get societe/lfsa_egais.json   "$E/lfsa_egais?unit=THS_PER&sex=T&age=Y_GE15&wstatus=EMP&sinceTimePeriod=2011$GEO"
get societe/lfsa_esgaed.json  "$E/lfsa_esgaed?unit=THS_PER&sex=T&age=Y15-64&isced11=TOTAL&sinceTimePeriod=2005$GEO"
get societe/une_rt_a.json     "$E/une_rt_a?unit=PC_ACT&sex=T&age=Y15-74&age=Y15-24&sinceTimePeriod=1995$GEO"
get societe/lfsi_emp_a.json   "$E/lfsi_emp_a?unit=PC_POP&sex=T&age=Y20-64&indic_em=EMP_LFS&sinceTimePeriod=1995$GEO"
get societe/ilc_di01.json     "$E/ilc_di01?unit=EUR&sinceTimePeriod=2005$GEO"
get societe/ilc_di12.json     "$E/ilc_di12?age=TOTAL&sinceTimePeriod=2005$GEO"
get societe/ilc_li02.json     "$E/ilc_li02?unit=PC&rskpovth=B_60&sex=T&sinceTimePeriod=2005$GEO$(for a in TOTAL Y_LT18 Y18-64 Y_GE65; do printf "&age=%s" "$a"; done)"
get societe/ilc_li10.json     "$E/ilc_li10?unit=PC&rskpovth=B_60&sex=T&age=TOTAL&sinceTimePeriod=2005$GEO"
get societe/ilc_mdsd11.json   "$E/ilc_mdsd11?unit=PC&sex=T&age=TOTAL&sinceTimePeriod=2015$GEO"
get societe/env_wasgen.json   "$E/env_wasgen?unit=T&unit=KG_HAB&hazard=HAZ_NHAZ&waste=TOTAL&sinceTimePeriod=2004$GEO"
get societe/env_wastrt.json   "$E/env_wastrt?unit=T&hazard=HAZ_NHAZ&waste=TOTAL&sinceTimePeriod=2004$GEO"
get societe/env_wasmun.json   "$E/env_wasmun?unit=KG_HAB&unit=THS_T&sinceTimePeriod=1995$GEO"

# Commerce extérieur de la France (Comext) : par partenaire et par chapitre de produits
C="https://ec.europa.eu/eurostat/api/comext/dissemination/statistics/1.0/data/DS-059341"
YR=$(date +%Y); LAST=$((YR-1))
get themes/comext_partenaires.json "$C?reporter=FR&freq=A&time=$LAST&flow=1&flow=2&product=TOTAL&indicators=VALUE_EUR&indicators=QUANTITY_KG"
get themes/comext_produits.json "$C?reporter=FR&freq=A&time=$LAST&flow=1&flow=2&partner=WORLD&partner=INT_EU27_2020&partner=EXT_EU27_2020&indicators=VALUE_EUR&indicators=QUANTITY_KG$(for i in $(seq -w 1 99); do printf "&product=%s" "$i"; done)"
get themes/comext_historique.json "$C?reporter=FR&freq=A&sinceTimePeriod=2002&flow=1&flow=2&partner=WORLD&product=TOTAL&indicators=VALUE_EUR&indicators=QUANTITY_KG"

# Alimentation : bilans alimentaires FAOSTAT (Europe), filtrés
TMPZ=$(mktemp)
get "$TMPZ" "https://bulks-faostat.fao.org/production/FoodBalanceSheets_E_Europe.zip"
python3 "$SCRIPTS/filter_fao.py" "$TMPZ" themes/fao_fbs.csv && rm -f "$TMPZ"
echo "OK"
