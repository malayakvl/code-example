import pool from './connect.js';
import { tblHeadFileds } from './../../common/constantsTable.js';
import { logger } from '../../common/logger.js';

class Property {
    async search (msa, searchText, limit, offset) {
        const client = await pool.connect();
        try {
            const res = await client.query(`SELECT * FROM common.property_search('${msa}', '${searchText}', ${limit}, ${offset});`);
            const propertyIds = res.rows.length > 0 ? res.rows : [];
            const error = null;
            return {
                propertyIds,
                error
            };
        } catch (e) {
            if (process.env.NODE_ENV === 'development') {
                logger.log(
                    'error',
                    'Model error:',
                    { message: e.message }
                );
            }
            const propertyIds = null;
            const error = {
                code: 500,
                message: 'Error property IDs fetch'
            };
            return {
                propertyIds,
                error
            };
        } finally {
            client.release();
        }
    }

    async searchOwner (msa, text, filterParams) {
        const client = await pool.connect();
        try {
            const query = `SELECT * FROM common.get_filter_values_owner(
                '${msa}', 
                '${filterParams.replace(/\$/g, '\'\'')}', 
                '${text}', 
                4);`;

            const res = await client.query(query);
            const propertyIds = res.rows.length > 0 ? res.rows : [];
            const error = null;
            return {
                propertyIds,
                error
            };
        } catch (e) {
            if (process.env.NODE_ENV === 'development') {
                logger.log(
                    'error',
                    'Model error:',
                    { message: e.message }
                );
            }
            const propertyIds = null;
            const error = {
                code: 500,
                message: 'Error property IDs fetch'
            };
            return {
                propertyIds,
                error
            };
        } finally {
            client.release();
        }
    }

    async generateConditions (msa, filter) {
        const queryConditions = [];
        var pCondition = [];
        for (const key in filter) {
            let paramSet = '';
            if (key !== 'total_affordable_units' && key !== 'total_units') {
                paramSet = JSON.parse(filter[key]);
            }
            switch (key) {
            case 'county':
                queryConditions.push(` county_id IN (${paramSet.join(', ')}) `);
                break;
            case 'street_filter':
                var streetQuery = [];
                paramSet.forEach(street => {
                    streetQuery.push(` (full_street_name_id='${street.id}' AND (address_number >= ${street.min} AND address_number <= ${street.max})) `);
                });
                if (streetQuery.length) {
                    queryConditions.push(` pv.id IN (
                        SELECT DISTINCT unnest(property_id_arr) AS id
                        FROM ${msa}.parcels_to_addresses__view 
                        WHERE TRUE AND ( ${streetQuery.join(' OR ')} ))`
                    );
                }
                break;
            case 'address':
                // eslint-disable-next-line no-case-declarations
                const limitCodes = [];
                if (filter.address && filter.jurisdiction) {
                    var promisesCityQueriesJur = [];
                    promisesCityQueriesJur.push(this.getJurisdictionsIds(msa, JSON.parse(filter.jurisdiction)));
                    const resultsJurIds = await Promise.all(promisesCityQueriesJur);

                    JSON.parse(filter.address).forEach(address => {
                        resultsJurIds[0].dbjurIds.forEach(jtype => {
                            limitCodes.push((parseInt(address) * 100 + parseInt(jtype)));
                        });
                    });
                    queryConditions.push(` pv.city_limits_id_arr && ARRAY[${limitCodes.join(',')}] `);
                } else if (filter.address && !filter.jurisdiction) {
                    var promisesCityQueries = [];

                    promisesCityQueries.push(this.getCitiesCode(msa, JSON.parse(filter.address), ''));
                    const results = await Promise.all(promisesCityQueries);
                    queryConditions.push(` pv.city_limits_id_arr && ARRAY[${results[0].cityArr.join(',')}] `);
                }
                break;
            case 'jurisdiction':
                if (!filter.address) {
                    const promisesCityQueriesJur = [];
                    promisesCityQueriesJur.push(this.getJurisdictionsIds(msa, paramSet));
                    const resultsJurIds = await Promise.all(promisesCityQueriesJur);
                    const promisesCityQueries = [];
                    promisesCityQueries.push(this.getCitiesCode(msa, '', resultsJurIds[0].dbjurIds));
                    const results = await Promise.all(promisesCityQueries);
                    queryConditions.push(` pv.city_limits_id_arr && ARRAY[${results[0].cityArr.join(',')}] `);
                }
                break;
            case 'opportunity_zone':
                queryConditions.push(` pv.opportunity = ${parseInt(filter.opportunity_zone) === 1} `);
                break;
            case 'permits':
                pCondition = [];
                paramSet.forEach(permits => {
                    const rowCond = [];
                    if (permits.issued_date_from && permits.issued_date_to) {
                        rowCond.push(` issued_date BETWEEN '${permits.issued_date_from}' AND '${permits.issued_date_to}'`);
                    }
                    if (permits['filter-construction-permits-status-select']) {
                        rowCond.push(` status_current_id = '${permits['filter-construction-permits-status-select']}'`);
                    }
                    if (permits['filter-construction-permits-work-class-select']) {
                        rowCond.push(` work_class_id = '${permits['filter-construction-permits-work-class-select']}'`);
                    }
                    pCondition.push(` (${rowCond.join(' AND ')}) `);
                });
                queryConditions.push(` pv.id IN (
                    SELECT DISTINCT unnest(property_id_arr) AS id
                    FROM ${msa}.parcels_to_cpi__view 
                    WHERE TRUE AND ( ${pCondition.join(' OR ')} ))`
                );
                break;
            case 'site_plan':
                pCondition = [];
                paramSet.forEach(siteplan => {
                    const rowCond = [];
                    if (siteplan.status_date_sprc_from && siteplan.status_date_sprc_to) {
                        rowCond.push(` status_date BETWEEN '${siteplan.status_date_sprc_from}' AND '${siteplan.status_date_sprc_to}'`);
                    }
                    if (siteplan.application_start_date_sprc_from && siteplan.application_start_date_sprc_to) {
                        rowCond.push(` application_start_date BETWEEN '${siteplan.application_start_date_sprc_from}' AND '${siteplan.application_start_date_sprc_to}'`);
                    }
                    if (siteplan.approval_date_sprc_from && siteplan.approval_date_sprc_to) {
                        rowCond.push(` approval_date BETWEEN '${siteplan.approval_date_sprc_from}' AND '${siteplan.approval_date_sprc_to}'`);
                    }
                    if (siteplan.final_date_sprc_from && siteplan.final_date_sprc_to) {
                        rowCond.push(` final_date BETWEEN '${siteplan.final_date_sprc_from}' AND '${siteplan.final_date_sprc_to}'`);
                    }
                    if (siteplan['filter-site-plan-review-status-select']) {
                        rowCond.push(` status_id = '${siteplan['filter-site-plan-review-status-select']}'`);
                    }
                    pCondition.push(` (${rowCond.join(' AND ')}) `);
                });
                queryConditions.push(` pv.id IN (
                    SELECT DISTINCT unnest(property_id_arr) AS id
                    FROM ${msa}.parcels_to_sprc__view 
                    WHERE TRUE AND ( ${pCondition.join(' OR ')} ))`);
                break;
            case 'zoning_district':
                queryConditions.push(` pv.id IN (
                    SELECT DISTINCT unnest(property_id_arr) AS id
                    FROM ${msa}.parcels_to_zoning__view p2zoning
                    WHERE TRUE AND p2zoning.zoning_zty_id IN ('${paramSet.join('\',\'')}'))`);
                break;
            case 'zoning_overlay':
                queryConditions.push(` pv.id IN (
                    SELECT DISTINCT unnest(property_id_arr) AS id
                    FROM ${msa}.parcels_to_zoning__view p2zoning
                    WHERE TRUE AND p2zoning.overlay_code_arr && ARRAY['${paramSet.join('\',\'')}'])`);
                break;
            case 'zoning_review':
                pCondition = [];
                paramSet.forEach(zoningreview => {
                    const rowCond = [];
                    if (zoningreview.status_date_zoning_from && zoningreview.status_date_zoning_to) {
                        rowCond.push(` status_date BETWEEN '${zoningreview.status_date_zoning_from}' AND '${zoningreview.status_date_zoning_to}'`);
                    }
                    if (zoningreview.application_start_date_zoning_from && zoningreview.application_start_date_zoning_to) {
                        rowCond.push(` application_start_date BETWEEN '${zoningreview.application_start_date_zoning_from}' AND '${zoningreview.application_start_date_zoning_to}'`);
                    }
                    if (zoningreview.approval_date_zoning_from && zoningreview.approval_date_zoning_to) {
                        rowCond.push(` approval_date BETWEEN '${zoningreview.approval_date_zoning_from}' AND '${zoningreview.approval_date_zoning_to}'`);
                    }
                    if (zoningreview.final_date_zoning_from && zoningreview.final_date_zoning_to) {
                        rowCond.push(` final_date BETWEEN '${zoningreview.final_date_zoning_from}' AND '${zoningreview.final_date_zoning_to}'`);
                    }
                    if (zoningreview['filter-zoning-review-status-select']) {
                        rowCond.push(` detailed_status_id = '${zoningreview['filter-zoning-review-status-select']}'`);
                    }
                    pCondition.push(` (${rowCond.join(' AND ')}) `);
                });
                queryConditions.push(` pv.id IN (
                    SELECT DISTINCT unnest(property_id_arr) AS id
                    FROM ${msa}.parcels_to_zrc__view p2zrc
                    WHERE TRUE AND ${pCondition.join(' OR ')})`);
                break;
            case 'owner':
                // eslint-disable-next-line no-case-declarations
                const ownerCond = [];
                paramSet.forEach(owner => {
                    ownerCond.push(`( id = '${owner}' )`);
                });
                queryConditions.push(` pv.id IN (
                    SELECT DISTINCT unnest(property_id_arr) AS id
                    FROM ${msa}.property__owner__view
                    WHERE TRUE
                    AND ( ${ownerCond.join(' OR ')} ))`);
                break;
            case 'education':
                queryConditions.push(` pv.education_id_arr && ARRAY[${paramSet.join(',')}] `);
                break;
            case 'mls':
                queryConditions.push(` pv.mls_id_arr && ARRAY[${paramSet.join(',')}] `);
                break;
            case 'floodplain':
                if (filter[key] === 0) {
                    queryConditions.push(' (floodplain IS NULL OR floodplain = \'0\')');
                } else {
                    // 1 - 100 years, 2 - 500 years, 3 - intersects 100 and 500 years
                    if (filter[key] === 3) {
                        queryConditions.push('  NOT (floodplain IS NULL OR floodplain = \'0\') ');
                    } else {
                        queryConditions.push(` (floodplain = '${filter[key]}' OR  floodplain = '3') `);
                    }
                }
                break;
            case 'fdf':
                queryConditions.push(` floodplain_fd_flood_zone_id_arr && ARRAY[${paramSet.join(',')}] `);
                break;
            case 'subdivision':
                pCondition = [];
                paramSet.forEach(subdivision => {
                    const rowCond = [];
                    if (subdivision.status_date_subdivision_from && subdivision.status_date_subdivision_to) {
                        rowCond.push(` status_date BETWEEN '${subdivision.status_date_subdivision_from}' AND '${subdivision.status_date_subdivision_to}'`);
                    }
                    if (subdivision.approval_date_subdivision_from && subdivision.approval_date_subdivision_to) {
                        rowCond.push(` approval_date BETWEEN '${subdivision.approval_date_subdivision_from}' AND '${subdivision.approval_date_subdivision_to}'`);
                    }
                    if (subdivision.application_start_date_subdivision_from && subdivision.application_start_date_subdivision_to) {
                        rowCond.push(` application_start_date BETWEEN '${subdivision.application_start_date_subdivision_from}' AND '${subdivision.application_start_date_subdivision_to}'`);
                    }
                    if (subdivision.final_date_subdivision_from && subdivision.final_date_subdivision_to) {
                        rowCond.push(` final_date BETWEEN '${subdivision.final_date_subdivision_from}' AND '${subdivision.final_date_subdivision_to}'`);
                    }
                    if (subdivision['filter-subdivision-status-select']) {
                        rowCond.push(` status_id = '${subdivision['filter-subdivision-status-select']}'`);
                    }
                    pCondition.push(` (${rowCond.join(' AND ')}) `);
                });
                queryConditions.push(` pv.id IN (
                    SELECT DISTINCT unnest(property_id_arr) AS id
                    FROM ${msa}.parcels_to_subdivision__view
                    WHERE TRUE AND ${pCondition.join(' OR ')})`);
                break;
            case 'affordable':
                if (filter[key] === -1) {
                    queryConditions.push(` pv.id NOT IN (
                        SELECT DISTINCT unnest(property_id_arr) AS id
                        FROM ${msa}.parcels_to_affordable__view
                        WHERE TRUE )`);
                } else {
                    const pCond3 = [];
                    if (filter.total_units) {
                        const pCond1 = [];
                        JSON.parse(filter.total_units).forEach(cnt => {
                            if (cnt.indexOf('more') >= 0) {
                                pCond1.push(` total_units >= ${cnt.replace(/more/g, '')} `);
                            } else if (cnt.indexOf('less') >= 0) {
                                pCond1.push(` total_units <= ${cnt.replace(/less/g, '')} `);
                            } else if (cnt.indexOf('-') >= 0) {
                                const afInterval = cnt.split('-');
                                pCond1.push(` (total_units >= ${afInterval[0]} AND total_units <= ${afInterval[1]}) `);
                            } else {
                                pCond1.push(` total_units = ${cnt} `);
                            }
                        });
                        if (pCond1.length) pCond3.push(` (${pCond1.join(' OR ')}) `);
                    }
                    if (filter.total_affordable_units) {
                        const pCond2 = [];
                        JSON.parse(filter.total_affordable_units).forEach(cnt => {
                            if (cnt.indexOf('more') >= 0) {
                                pCond2.push(` total_affordable_units >= ${cnt.replace(/more/g, '')} `);
                            } else if (cnt.indexOf('less') >= 0) {
                                pCond2.push(` total_affordable_units <= ${cnt.replace(/less/g, '')} `);
                            } else if (cnt.indexOf('-') >= 0) {
                                const afInterval = cnt.split('-');
                                pCond2.push(` (total_affordable_units >= ${afInterval[0]} AND total_affordable_units <= ${afInterval[1]}) `);
                            } else {
                                pCond2.push(` total_affordable_units = ${cnt} `);
                            }
                        });
                        if (pCond2.length) pCond3.push(` (${pCond2.join(' OR ')}) `);
                    }
                    queryConditions.push(` pv.id IN (
                        SELECT DISTINCT unnest(property_id_arr) AS id
                        FROM ${msa}.parcels_to_affordable__view
                        WHERE TRUE ${pCond3.length ? ` AND (${pCond3.join(' AND ')}) ` : ''})`);
                }
                break;
            case 'zip_code':
                queryConditions.push(` pv.id IN (
                    SELECT DISTINCT unnest(property_id_arr) AS id
                    FROM ${msa}.parcels_to_zip__view
                    WHERE TRUE AND zip_code_int IN ('${paramSet.join('\',\'')}'))`);
                break;
            default:
                if (key !== 'jurisdiction' && key !== 'total_units' && key !== 'total_affordable_units') {
                    queryConditions.push(` ${key} IN (${paramSet.join(', ')}) `);
                }
                break;
            }
        }
        return queryConditions;
    }

    async filter (msa, filter) {
        const fConditions = await this.generateConditions(msa, filter);
        try {
            const request = `SELECT DISTINCT unnest(pv.parcel_id_arr) AS parcel_id
                        FROM ${msa}.property__view pv WHERE TRUE AND ${fConditions.join(' AND ')}`;
            const res = await pool.query(request);
            const properties = res.rows.length > 0 ? res.rows : [];
            const error = null;
            if (process.env.NODE_ENV === 'development') {
                logger.log(
                    'info',
                    'Filter query:',
                    { message: request }
                );
            }
            return {
                properties,
                error
            };
        } catch (e) {
            if (process.env.NODE_ENV === 'development') {
                logger.log(
                    'error',
                    'Model error:',
                    { message: e.message }
                );
            }
            const properties = null;
            const error = {
                code: 500,
                message: 'Error property IDs fetch'
            };
            return {
                properties,
                error
            };
        }
    }

    async filterPropertyQty (msa, filter) {
        const fConditions = await this.generateConditions(msa, filter);
        let propertiesCnt = null;
        try {
            const request = `SELECT COUNT(DISTINCT pv.id) AS id_cnt, 
                COUNT(DISTINCT pv.parcel_id) AS parcel_id_cnt 
                FROM (SELECT pv.id, unnest(pv.parcel_id_arr) AS parcel_id FROM ${msa}.property__view pv 
                WHERE TRUE AND ${fConditions.join(' AND ')}) pv`;
            if (process.env.NODE_ENV === 'development') {
                logger.log(
                    'info',
                    'Filter property qty:',
                    { message: request }
                );
            }
            const res = await pool.query(request);
            propertiesCnt = res.rows.length > 0 ? res.rows : [];
            const error = null;
            return {
                propertiesCnt,
                error
            };
        } catch (e) {
            if (process.env.NODE_ENV === 'development') {
                logger.log(
                    'error',
                    'Model error:',
                    { message: e.message }
                );
            }
            const error = {
                code: 500,
                message: 'Error property IDs fetch'
            };
            return {
                propertiesCnt,
                error
            };
        }
    }

    async filterExport (msa, filter, orderBy, sort) {
        const fConditions = await this.generateConditions(msa, filter);
        const fSorting = await this.generateSorting(orderBy, sort);
        try {
            const request = `SELECT
                    pv.id,
                    pv.property_id,
                    pv.owner,
                    pv.address,
                    pv.full_street_name,
                    prdv.parcels_details_arr, prdv.parcels_details_cnt
                FROM ${msa}.property__view pv
                INNER JOIN ${msa}.property_details__view prdv USING (id)
                WHERE TRUE
                AND ${fConditions.join(' AND ')}
                ${fSorting}
            `;
            if (process.env.NODE_ENV === 'development') {
                logger.log(
                    'info',
                    'Filter export query:',
                    { message: request }
                );
            }
            const res = await pool.query(request);
            const properties = res.rows.length > 0 ? res.rows : [];

            const error = null;
            const _options = await pool.query(`SELECT * FROM common.get_layers_to_msas_for_render('${msa}');`);
            const filterFields = [];
            _options.rows.forEach(row => {
                if (row.filter_table) {
                    filterFields.push(row.filter_table);
                }
            });
            const tblHeaderFields = [
                {
                    id: 'property_id',
                    title: 'Property ID'
                },
                {
                    id: 'owner',
                    title: 'Owner'
                },
                {
                    id: 'address',
                    title: 'Street Name, Number'
                },
                {
                    id: 'parcel_id',
                    title: 'Parcel'
                },
                {
                    id: 'po_name',
                    title: 'City'
                },
                {
                    id: 'county',
                    title: 'County'
                },
                {
                    id: 'zip_code',
                    title: 'Zip Code'
                }
            ];
            const tblHeaderRecord = {};
            tblHeaderRecord.property_id = 'Property ID';
            tblHeaderRecord.owner = 'Owner';
            tblHeaderRecord.address = 'Street Name, Number';
            tblHeaderRecord.parcel_id = 'Parcel';
            tblHeaderRecord.po_name = 'City';
            tblHeaderRecord.county = 'County';
            tblHeaderRecord.zip_code = 'Zip Code';

            for (const key in tblHeadFileds) {
                if (filterFields.includes(key)) {
                    switch (key) {
                    case 'affordable_details':
                        tblHeaderFields.push({
                            id: 'affordable_arr__project_name',
                            title: '(AH) Project'
                        });
                        tblHeaderFields.push({
                            id: 'affordable_arr__total_units',
                            title: '(AH) Units Totals'
                        });
                        tblHeaderFields.push({
                            id: 'affordable_arr__total_affordable_units',
                            title: '(AH) Low Income Totals'
                        });
                        tblHeaderRecord.affordable_arr__project_name = '(AH) Project';
                        tblHeaderRecord.affordable_arr__total_units = '(AH) Units Totals';
                        tblHeaderRecord.affordable_arr__total_units = '(AH) Low Income Totals';
                        break;
                    case 'floodplain_details':
                        tblHeaderFields.push({
                            id: 'floodplain',
                            title: 'FEMA Floodplain'
                        });
                        tblHeaderRecord.floodplain = 'FEMA Floodplain';
                        break;
                    case 'floodplain_fd_details':
                        tblHeaderFields.push({
                            id: 'floodplain_fd',
                            title: 'Fully Developed Floodplain'
                        });
                        tblHeaderRecord.floodplain_fd = 'Fully Developed Floodplain';
                        break;
                    case 'water_details':
                        tblHeaderFields.push({
                            id: 'water_details',
                            title: 'Water'
                        });
                        tblHeaderRecord.water_details = 'Water';
                        break;
                    case 'city_limits_details':
                        tblHeaderFields.push({
                            id: 'city_limits_arr__name',
                            title: 'City Limits & ETJ'
                        });
                        tblHeaderRecord.city_limits_arr__name = 'City Limits & ETJ';
                        break;
                    case 'education_details':
                        tblHeaderFields.push({
                            id: 'education_arr__name',
                            title: 'Independent School District'
                        });
                        tblHeaderRecord.education_arr__name = 'Independent School District';
                        break;
                    case 'mls_details':
                        tblHeaderFields.push({
                            id: 'mls_arr__name',
                            title: 'Multiple Listing Service Area'
                        });
                        tblHeaderRecord.mls_arr__name = 'Multiple Listing Service Area';
                        break;
                    case 'zoning_details':
                        tblHeaderFields.push({
                            id: 'zoning_arr__zoning_zty',
                            title: 'Zoning Code'
                        });
                        tblHeaderFields.push({
                            id: 'zoning_arr__overlay_code',
                            title: 'Zoning  Overlay Code'
                        });
                        tblHeaderRecord.zoning_arr__zoning_zty = 'Zoning Code';
                        tblHeaderRecord.zoning_arr__overlay_code = 'Zoning  Overlay Code';
                        break;
                    case 'opportunity_details':
                        tblHeaderFields.push({
                            id: 'opportunity',
                            title: 'Opportunity Zone'
                        });
                        tblHeaderRecord.opportunity = 'Opportunity Zone';
                        break;
                    case 'cpi_details':
                        tblHeaderFields.push({
                            id: 'cpi_arr__issued_date',
                            title: 'CPI Issued date'
                        });
                        tblHeaderFields.push({
                            id: 'cpi_arr__status_current',
                            title: 'CPI Status current'
                        });
                        tblHeaderFields.push({
                            id: 'cpi_arr__status_date',
                            title: 'CPI Status date'
                        });
                        tblHeaderFields.push({
                            id: 'cpi_arr__work_class',
                            title: 'CPI Work class'
                        });

                        tblHeaderRecord.cpi_arr__issued_date = 'CPI Issued date';
                        tblHeaderRecord.cpi_arr__status_current = 'CPI Status current';
                        tblHeaderRecord.cpi_arr__status_date = 'CPI Status date';
                        tblHeaderRecord.cpi_arr__work_class = 'CPI Work class';
                        break;
                    case 'sprc_details':
                        tblHeaderFields.push({
                            id: 'sprc_arr__case_name',
                            title: 'SPRC Case Name'
                        });
                        tblHeaderFields.push({
                            id: 'sprc_arr__permit_num',
                            title: 'SPRC Permit No.'
                        });
                        tblHeaderFields.push({
                            id: 'sprc_arr__application_start_date_sprc',
                            title: 'SPRC App Start Date'
                        });
                        tblHeaderFields.push({
                            id: 'sprc_arr__approval_date',
                            title: 'SPRC Approval Date'
                        });
                        tblHeaderFields.push({
                            id: 'sprc_arr__final_date',
                            title: 'SPRC Final Date'
                        });
                        tblHeaderFields.push({
                            id: 'sprc_arr__status_current',
                            title: 'SPRC Status'
                        });
                        tblHeaderFields.push({
                            id: 'sprc_arr__status_date',
                            title: 'SPRC Status Date'
                        });

                        tblHeaderRecord.sprc_arr__case_name = 'SPRC Case Name';
                        tblHeaderRecord.sprc_arr__permit_num = 'SPRC Permit No.';
                        tblHeaderRecord.sprc_arr__application_start_date_sprc = 'SPRC App Start Date';
                        tblHeaderRecord.sprc_arr__approval_date = 'SPRC Approval Date';
                        tblHeaderRecord.sprc_arr__final_date = 'SPRC Final Date';
                        tblHeaderRecord.sprc_arr__status_current = 'SPRC Status';
                        tblHeaderRecord.sprc_arr__status_date = 'SPRC Status Date';
                        break;
                    case 'subdivision_details':
                        tblHeaderFields.push({
                            id: 'subdivision_arr__case_name',
                            title: 'Subdivision Case Name'
                        });
                        tblHeaderFields.push({
                            id: 'subdivision_arr__permit_num',
                            title: 'Subdivision Permit No.'
                        });
                        tblHeaderFields.push({
                            id: 'subdivision_arr__application_start_date_sprc',
                            title: 'Subdivision App Start Date'
                        });
                        tblHeaderFields.push({
                            id: 'subdivision_arr__approval_date',
                            title: 'Subdivision Approval Date'
                        });
                        tblHeaderFields.push({
                            id: 'subdivision_arr__final_date',
                            title: 'Subdivision Final Date'
                        });
                        tblHeaderFields.push({
                            id: 'subdivision_arr__status_current',
                            title: 'Subdivision Status'
                        });
                        tblHeaderFields.push({
                            id: 'subdivision_arr__status_date',
                            title: 'Subdivision Status Date'
                        });

                        tblHeaderRecord.subdivision_arr__case_name = 'Subdivision Case Name';
                        tblHeaderRecord.subdivision_arr__permit_num = 'Subdivision Permit No.';
                        tblHeaderRecord.subdivision_arr__application_start_date_sprc = 'Subdivision App Start Date';
                        tblHeaderRecord.subdivision_arr__approval_date = 'Subdivision Approval Date';
                        tblHeaderRecord.subdivision_arr__final_date = 'Subdivision Final Date';
                        tblHeaderRecord.subdivision_arr__status_current = 'Subdivision Status';
                        tblHeaderRecord.subdivision_arr__status_date = 'Subdivision Status Date';
                        break;
                    case 'zrc_details':
                        tblHeaderFields.push({
                            id: 'zrc_arr__case_name',
                            title: 'ZRC Case Name'
                        });
                        tblHeaderFields.push({
                            id: 'zrc_arr__zoning_case_name',
                            title: 'ZRC Zoning Case Name'
                        });
                        tblHeaderFields.push({
                            id: 'zrc_arr__permit_num',
                            title: 'ZRC Permit No.'
                        });
                        tblHeaderFields.push({
                            id: 'zrc_arr__application_start_date_sprc',
                            title: 'ZRC App Start Date'
                        });
                        tblHeaderFields.push({
                            id: 'zrc_arr__approval_date',
                            title: 'ZRC Approval Date'
                        });
                        tblHeaderFields.push({
                            id: 'zrc_arr__final_date',
                            title: 'ZRC Final Date'
                        });
                        tblHeaderFields.push({
                            id: 'zrc_arr__status_current',
                            title: 'ZRC  Status'
                        });
                        tblHeaderFields.push({
                            id: 'zrc_arr__zoning_case_status',
                            title: 'ZRC Case Status'
                        });
                        tblHeaderFields.push({
                            id: 'zrc_arr__status_date',
                            title: 'ZRC Status Date'
                        });
                        tblHeaderFields.push({
                            id: 'zrc_arr__proposed_zoning',
                            title: 'ZRC Proposed Zoning'
                        });

                        tblHeaderRecord.zrc_arr__case_name = 'ZRC Case Name';
                        tblHeaderRecord.zrc_arr__zoning_case_name = 'ZRC Permit No.';
                        tblHeaderRecord.zrc_arr__permit_num = 'ZRC App Start Date';
                        tblHeaderRecord.zrc_arr__application_start_date_sprc = 'ZRC Approval Date';
                        tblHeaderRecord.zrc_arr__approval_date = 'ZRC Final Date';
                        tblHeaderRecord.zrc_arr__final_date = 'ZRC Status';
                        tblHeaderRecord.zrc_arr__status_current = 'ZRC Status Date';
                        tblHeaderRecord.zrc_arr__zoning_case_status = 'ZRC Final Date';
                        tblHeaderRecord.zrc_arr__status_date = 'ZRC Status';
                        tblHeaderRecord.zrc_arr__proposed_zoning = 'ZRC Status Date';
                        break;
                    }
                }
            }
            const dataForFile = [];
            dataForFile.push(tblHeaderRecord);
            let textData;
            properties.forEach(property => {
                const details = property.parcels_details_arr;
                details.forEach((parcel, key) => {
                    if (key > 0) {
                        const row = {};
                        tblHeaderFields.forEach(field => {
                            const colId = field.id;
                            switch (colId) {
                            case 'property_id':
                                row.property_id = property.property_id;
                                break;
                            case 'owner':
                                row.owner = property.owner;
                                break;
                            case 'address':
                                row.address = `${property.full_street_name} ${property.address ? `, ${property.address}` : ''}`;
                                break;
                            case 'parcel_id':
                                row[colId] = parcel.details[colId] !== 'undefined' ? parcel.details[colId] === 1 ? 'Yes' : 'No' : 'N/A';
                                row[colId] = parcel[colId];
                                break;
                            case 'county':
                                row.county = parcel.details.county;
                                break;
                            case 'floodplain':
                            case 'floodplain_fd':
                            case 'water_details':
                            case 'opportunity':
                                row[colId] = parcel.details[colId] !== 'undefined' ? parcel.details[colId] === 1 ? 'Yes' : 'No' : 'N/A';
                                break;
                            case 'zip_code':
                            case 'po_name':
                                textData = '';
                                parcel.details.zip_arr.forEach(zip => {
                                    textData += `${zip[colId]}\n`;
                                });
                                row[colId] = textData;
                                break;
                            default:
                                // eslint-disable-next-line no-case-declarations
                                const colKeys = colId.split('__');
                                textData = '';
                                if (parcel.details[colKeys[0]]) {
                                    parcel.details[colKeys[0]].forEach(_data => {
                                        if (_data[colKeys[1]] != null) {
                                            textData += `${_data[colKeys[1]]}\n`;
                                        } else {
                                            textData += 'N/A';
                                        }
                                    });
                                } else {
                                    textData = 'N/A';
                                }
                                row[colId] = textData !== '' ? textData : 'N/A';
                                break;
                            }
                        });
                        dataForFile.push(row);
                    }
                });
            });
            return {
                tblHeaderRecord,
                dataForFile,
                properties,
                error
            };
        } catch (e) {
            if (process.env.NODE_ENV === 'development') {
                logger.log(
                    'error',
                    'Model error:',
                    { message: e.message }
                );
            }
            const properties = null;
            const error = {
                code: 500,
                message: 'Error property IDs fetch'
            };
            return {
                properties,
                error
            };
        }
    }

    async filterProperty (msa, filter, page, orderBy, sort) {
        const fConditions = await this.generateConditions(msa, filter);
        const fSorting = await this.generateSorting(orderBy, sort);
        try {
            const request = `SELECT
                            pv.id, 
                            pv.property_id, 
                            pv.owner, 
                            pv.address, 
                            pv.full_street_name, 
                            prdv.parcels_details_arr->1->'geom_center_x' AS geom_center_x,
                            prdv.parcels_details_arr->1->'geom_center_y'  AS geom_center_y,
                            prdv.parcels_details_arr, prdv.parcels_details_cnt
                        FROM ${msa}.property__view pv 
                        INNER JOIN ${msa}.property_details__view prdv USING (id)
                        WHERE TRUE
                        AND ${fConditions.join(' AND ')}
                        ${fSorting}                        
                        LIMIT 10 OFFSET ${(page - 1) * 10}`;
            if (process.env.NODE_ENV === 'development') {
                logger.log(
                    'info',
                    'Filter property:',
                    { message: request }
                );
            }
            const res = await pool.query(request);
            const properties = res.rows.length > 0 ? res.rows : [];
            const error = null;

            return {
                properties,
                error
            };
        } catch (e) {
            if (process.env.NODE_ENV === 'development') {
                logger.log(
                    'error',
                    'Model error:',
                    { message: e.message }
                );
            }
            const properties = null;
            const error = {
                code: 500,
                message: 'Error property IDs fetch'
            };
            return {
                properties,
                error
            };
        }
    }

    async getJurisdictionsIds (msa, jurIds) {
        const reqJur = `SELECT array_agg(DISTINCT id) AS jur_id_arr FROM ${msa}.city_limits__jurisdiction_type WHERE id IN (${jurIds.join(',')}) OR parent_id IN (${jurIds.join(',')})`;
        const res = await pool.query(reqJur);
        const dbjurIds = res.rows.length > 0 ? res.rows[0].jur_id_arr : [];
        return {
            dbjurIds
        };
    }

    async getCitiesCode (msa, cityIds, jurIds) {
        if (cityIds.length > 0) {
            const reqCity = `SELECT array_agg(DISTINCT city_limits_id) AS city_limits_id_arr FROM ${msa}.city_limits WHERE city_id IN (${cityIds.join(',')})`;
            const res = await pool.query(reqCity);
            const cityArr = res.rows.length > 0 ? res.rows[0].city_limits_id_arr : [];
            return {
                cityArr
            };
        } else if (jurIds.length > 0) {
            const reqCity = `SELECT array_agg(DISTINCT city_limits_id) AS city_limits_id_arr FROM ${msa}.city_limits WHERE jurisdiction_type_id IN (${jurIds.join(',')})`;
            const res = await pool.query(reqCity);
            const cityArr = res.rows.length > 0 ? res.rows[0].city_limits_id_arr : [];
            return {
                cityArr
            };
        }
    }

    async generateSorting (orderBy, sort) {
        const fnc = sort === 'asc' ? 'MIN' : 'MAX';
        const orderParamArr = {
            property_id: 'pv.property_id',
            owner: 'pv.owner',

            address: 'pv.address',
            full_street_name: 'pv.full_street_name',
            zip__zip_code: '(SELECT MAX(f) FROM UNNEST((string_to_array(parcels_details_arr->0->\'details\'->\'zip_arr\'->0->>\'zip_code\', \', \'))::integer[]) AS t(f))',
            zip__po_name: 'parcels_details_arr->0->\'details\'->\'zip_arr\'->0->>\'po_name\'',
            county: 'parcels_details_arr->0->\'details\'->>\'county\'',

            parcels_cnt: 'prdv.parcels_details_cnt',

            floodplain: '(parcels_details_arr->0->\'details\'->>\'floodplain\')::integer',
            floodplain_fd: '(parcels_details_arr->0->\'details\'->>\'floodplain_fd\')::integer',
            water: 'parcels_details_arr->0->\'details\'->>\'water\'',

            city_limits__name: 'parcels_details_arr->0->\'details\'->\'city_limits_arr\'->0->>\'name\'',
            education__name: 'parcels_details_arr->0->\'details\'->\'education_arr\'->0->>\'name\'',
            mls__name: 'parcels_details_arr->0->\'details\'->\'mls_arr\'->0->>\'name\'',

            zoning__zoning_zty: 'parcels_details_arr->0->\'details\'->\'zoning_arr\'->0->>\'zoning_zty\'',
            zoning__overlay_code: 'parcels_details_arr->0->\'details\'->\'zoning_arr\'->0->>\'overlay_code\'',

            affordable__project_name: 'parcels_details_arr->0->\'details\'->\'affordable_arr\'->0->>\'project_name\'',
            affordable__total_units: '(SELECT MAX(f) FROM UNNEST((string_to_array(parcels_details_arr->0->\'details\'->\'affordable_arr\'->0->>\'total_units\', \', \'))::integer[]) AS t(f))',
            affordable__total_affordable_units: '(SELECT MAX(f) FROM UNNEST((string_to_array(parcels_details_arr->0->\'details\'->\'affordable_arr\'->0->>\'total_affordable_units\', \', \'))::integer[]) AS t(f))',

            opportunity: '(parcels_details_arr->0->\'details\'->>\'opportunity\')::integer',

            cpi__issued_date: `(SELECT ${fnc}(f) FROM UNNEST((string_to_array(parcels_details_arr->0->'details'->'cpi_arr'->0->>'issued_date', ' -- '))::date[]) AS t(f))`,
            cpi__permit_num: 'parcels_details_arr->0->\'details\'->\'cpi_arr\'->0->>\'permit_num\'',
            cpi__status_current: 'parcels_details_arr->0->\'details\'->\'cpi_arr\'->0->>\'status_current\'',
            cpi__status_date: `(SELECT ${fnc}(f) FROM UNNEST((string_to_array(parcels_details_arr->0->'details'->'cpi_arr'->0->>'status_date', ' -- '))::date[]) AS t(f))`,
            cpi__work_class: 'parcels_details_arr->0->\'details\'->\'cpi_arr\'->0->>\'work_class\'',

            sprc__case_name: 'parcels_details_arr->0->\'details\'->\'sprc_arr\'->0->>\'case_name\'',
            sprc__permit_num: 'parcels_details_arr->0->\'details\'->\'sprc_arr\'->0->>\'permit_num\'',
            sprc__application_start_date: `(SELECT ${fnc}(f) FROM UNNEST((string_to_array(parcels_details_arr->0->'details'->'sprc_arr'->0->>'application_start_date', ' -- '))::date[]) AS t(f))`,
            sprc__approval_date: `(SELECT ${fnc}(f) FROM UNNEST((string_to_array(parcels_details_arr->0->'details'->'sprc_arr'->0->>'approval_date', ' -- '))::date[]) AS t(f))`,
            sprc__final_date: `(SELECT ${fnc}(f) FROM UNNEST((string_to_array(parcels_details_arr->0->'details'->'sprc_arr'->0->>'final_date', ' -- '))::date[]) AS t(f))`,
            sprc__status_current: 'parcels_details_arr->0->\'details\'->\'sprc_arr\'->0->>\'status_current\'',
            sprc__status_date: `(SELECT ${fnc}(f) FROM UNNEST((string_to_array(parcels_details_arr->0->'details'->'sprc_arr'->0->>'status_date', ' -- '))::date[]) AS t(f))`,

            subdivision__case_name: 'parcels_details_arr->0->\'details\'->\'subdivision_arr\'->0->>\'case_name\'',
            subdivision__permit_num: 'parcels_details_arr->0->\'details\'->\'subdivision_arr\'->0->>\'permit_num\'',
            subdivision__application_start_date: `(SELECT ${fnc}(f) FROM UNNEST((string_to_array(parcels_details_arr->0->'details'->'subdivision_arr'->0->>'application_start_date', ' -- '))::date[]) AS t(f))`,
            subdivision__approval_date: `(SELECT ${fnc}(f) FROM UNNEST((string_to_array(parcels_details_arr->0->'details'->'subdivision_arr'->0->>'approval_date', ' -- '))::date[]) AS t(f))`,
            subdivision__final_date: `(SELECT ${fnc}(f) FROM UNNEST((string_to_array(parcels_details_arr->0->'details'->'subdivision_arr'->0->>'final_date', ' -- '))::date[]) AS t(f))`,
            subdivision__status_current: 'parcels_details_arr->0->\'details\'->\'subdivision_arr\'->0->>\'status_current\'',
            subdivision__status_date: `(SELECT ${fnc}(f) FROM UNNEST((string_to_array(parcels_details_arr->0->'details'->'subdivision_arr'->0->>'status_date', ' -- '))::date[]) AS t(f))`,

            zrc__zoning_case_name: 'parcels_details_arr->0->\'details\'->\'zrc_arr\'->0->>\'zoning_case_name\'',
            zrc__case_name: 'parcels_details_arr->0->\'details\'->\'zrc_arr\'->0->>\'case_name\'',
            zrc__permit_num: 'parcels_details_arr->0->\'details\'->\'zrc_arr\'->0->>\'permit_num\'',
            zrc__application_start_date: `(SELECT ${fnc}(f) FROM UNNEST((string_to_array(parcels_details_arr->0->'details'->'zrc_arr'->0->>'application_start_date', ' -- '))::date[]) AS t(f))`,
            zrc__approval_date: `(SELECT ${fnc}(f) FROM UNNEST((string_to_array(parcels_details_arr->0->'details'->'zrc_arr'->0->>'approval_date', ' -- '))::date[]) AS t(f))`,
            zrc__final_date: `(SELECT ${fnc}(f) FROM UNNEST((string_to_array(parcels_details_arr->0->'details'->'zrc_arr'->0->>'final_date', ' -- '))::date[]) AS t(f))`,
            zrc__status_current: 'parcels_details_arr->0->\'details\'->\'zrc_arr\'->0->>\'status_current\'',
            zrc__zoning_case_status: 'parcels_details_arr->0->\'details\'->\'zrc_arr\'->0->>\'zoning_case_status\'',
            zrc__status_date: `(SELECT ${fnc}(f) FROM UNNEST((string_to_array(parcels_details_arr->0->'details'->'zrc_arr'->0->>'status_date', ' -- '))::date[]) AS t(f))`,
            zrc__proposed_zoning: 'parcels_details_arr->0->\'details\'->\'zrc_arr\'->0->>\'proposed_zoning\''
        };
        const orderByStr = ` ORDER BY ${orderParamArr[`${orderBy}`]} ${sort} NULLS LAST`;
        return orderByStr;
    }
}

export default new Property();
