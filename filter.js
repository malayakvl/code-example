/* eslint-disable indent */
import { doRequestJSON } from '../lib/utils.js';
import mbmap from './definitions/defineMap.js';
import moment from 'moment';
import customSelect from 'custom-select';
import Litepicker from 'litepicker';
import loader from '../lib/loader.js';
import message from '../lib/messages.js';
import filterResultTable from './definitions/filterResultTable.js';
import { streetInput, streetSearch } from './filterElement/street.js';
import { zipInput } from './filterElement/zip.js';
import { countyInput } from './filterElement/county.js';
import { mlsInput } from './filterElement/mls.js';
import { floodplainFDInput } from './filterElement/floodplainFD.js';
import { educationInput } from './filterElement/education.js';
import { ownerInput } from './filterElement/owner.js';
import { zoningDistrictInput } from './filterElement/zoningDistrict.js';
import { zoningOverlayInput } from './filterElement/zoningOverlay.js';
import { cityInput } from './filterElement/city.js';
import mapStorage from './definitions/storageSettings.js';
import * as pako from 'pako';
import { generateCriteria, hideFavoritForm, saveToFavorits, showFavoritForm } from './service/filterServices';

customSelect(document.getElementById('Filter').querySelectorAll('select'));
customSelect(document.getElementById('order-select'));

const doSort = () => {
    const msa = document.getElementById('filterMsa').value;
    loader.show();
    const orderKey = document.getElementById('order-select').value;
    const sortType = document.querySelector('input[name="typeOrder"]:checked').value;
    const searchStr = document.getElementById('searchStrParam').innerText;
    doRequestJSON('GET', `/api/${msa}/filterProperty?msa=${msa}${searchStr}&page=1&orderBy=${orderKey}&sort=${sortType}`)
        .then((result) => {
            if (result.length > 0) {
                document.getElementById('filterResultTable').innerHTML = '';
                // eslint-disable-next-line no-undef
                document.getElementById('filterResultTable').append(filterResultTable(result, mbmap, false));
                document.getElementById('doDownload').classList.add('w3-hide');
                if (document.getElementById('pageSelector')) {
                    document.getElementById('pageSelector').customSelect.value = 1;
                }
            }
            document.getElementById('pageSelector').customSelect.value = 1;
        })
        .catch((e) => {
            console.error(e.message);
        });
};

const pageChange = (page, totalPages, totalValues) => {
    const msa = document.getElementById('filterMsa').value;
    const orderKey = document.getElementById('order-select').value;
    const sortType = document.querySelector('input[name="typeOrder"]:checked').value;
    const searchStr = document.getElementById('searchStrParam').innerText;
    loader.show();
    doRequestJSON('GET', `/api/${msa}/filterProperty?msa=${msa}${searchStr}&page=${page}&orderBy=${orderKey}&sort=${sortType}`)
        .then((result) => {
            if (result.length > 0) {
                document.getElementById('filterResultTable').innerHTML = '';
                // eslint-disable-next-line no-undef
                document.getElementById('filterResultTable').append(filterResultTable(result, mbmap, false));

                if (page > 1) {
                    document.getElementsByClassName('prev-link')[0].classList.remove('disabled');
                } else {
                    document.getElementsByClassName('prev-link')[0].classList.add('disabled');
                }

                if (page < totalPages) {
                    document.getElementsByClassName('next-link')[0].classList.remove('disabled');
                } else {
                    document.getElementsByClassName('next-link')[0].classList.add('disabled');
                }
                document.getElementsByClassName('total-res-filter')[0].innerHTML = `of <b>${totalValues}</b> properties`;
            }
            document.getElementById('pageSelector').customSelect.value = page;
        })
        .catch((e) => {
            console.error(e.message);
        });
};

const generatePagination = (page, total) => {
    const divPag = document.getElementById('filterResultPagination');
    divPag.innerHTML = '';
    if (total >= 10) {
        divPag.classList.remove('w3-hide');
        const totalCountRow = document.createElement('div');
        totalCountRow.className = 'total-res-filter';
        totalCountRow.insertAdjacentHTML('beforeend', `of <b>${total}</b> properties`);
        const totalPages = parseInt(Math.ceil(total / 10));

        const pageDropdown = document.createElement('select');
        pageDropdown.setAttribute('id', 'pageSelector');
        for (let i = 1; i <= totalPages; i++) {
            const opt = document.createElement('option');
            opt.value = i;
            const toResult = (i - 1) * 10 + 10;

            opt.text = `${((i - 1) * 10 + 1)} - ${toResult > total ? total : toResult}`;
            pageDropdown.add(opt, null);
        }
        pageDropdown.onchange = function (e) {
            pageChange(e.target.value, totalPages, total);
        };

        const prevLink = document.createElement('div');
        prevLink.className = `prev-link ${page === 1 ? 'disabled' : ''}`;
        const shevronLeft = document.createElement('i');
        shevronLeft.className = 'fas fa-chevron-left';
        prevLink.appendChild(shevronLeft);
        shevronLeft.onclick = function (e) {
            const selPage = parseInt(document.getElementById('pageSelector').value) - 1;
            pageChange(selPage, totalPages, total);
            document.getElementById('pageSelector').value = selPage;
        };
        divPag.appendChild(prevLink);

        divPag.appendChild(pageDropdown);
        customSelect(document.getElementById('pageSelector'));

        const nextLink = document.createElement('div');
        nextLink.className = `next-link ${page === totalPages ? 'disabled' : ''}`;
        const shevronRight = document.createElement('i');
        shevronRight.className = 'fas fa-chevron-right';
        nextLink.appendChild(shevronRight);
        shevronRight.onclick = function (e) {
            const selPage = parseInt(document.getElementById('pageSelector').value) + 1;
            pageChange(selPage, totalPages, total);
            document.getElementById('pageSelector').value = selPage;
        };
        divPag.appendChild(nextLink);
        divPag.appendChild(totalCountRow);
    } else {
        const totalCountRow = document.createElement('div');
        totalCountRow.className = 'total-res-filter empty-pag';
        totalCountRow.insertAdjacentHTML('beforeend', `showing ${total} <b>${total > 1 ? 'properties' : 'property'}</b>`);
        divPag.appendChild(totalCountRow);
        divPag.classList.remove('w3-hide');
    }
};

const generateFilterParams = (dataObject = '') => {
    const isDataObject = typeof dataObject === 'object';
    let totalUnits;
    let totalUnitsArray;
    const affordableUnitsr = [];
    totalUnits = isDataObject ? dataObject.total_unitsHidden : document.getElementById('total_unitsHidden').value;
    if (totalUnits) {
        totalUnitsArray = totalUnits.replace(/\s/g, '').split(',');
        totalUnitsArray.forEach((z, n) => {
            const dMatch = z.match(/^(\d+)-(\d+)/gm);
            if (dMatch) {
                const amountInterval = z.split('-');

                if (amountInterval[0] > amountInterval[1]) {
                    alert('error interval');
                }
            } else {
                z = z.replaceAll('+', 'more');
                z = z.replaceAll('-', 'less');
            }
            affordableUnitsr.push(z);
        });
    }
    totalUnits = isDataObject ? dataObject.total_affordable_unitsHidden : document.getElementById('total_affordable_unitsHidden').value;
    const affordableLUnitsr = [];
    if (totalUnits) {
        totalUnitsArray = totalUnits.replace(/\s/g, '').split(',');
        totalUnitsArray.forEach((z, n) => {
            const dMatch = z.match(/^(\d+)-(\d+)/gm);
            if (dMatch) {
                const amountInterval = z.split('-');

                if (amountInterval[0] > amountInterval[1]) {
                    alert('error interval');
                }
            } else {
                z = z.replaceAll('+', 'more');
                z = z.replaceAll('-', 'less');
            }
            affordableLUnitsr.push(z);
        });
    }
    const zipcode = isDataObject ? dataObject.zipcodeNameHidden : document.getElementById('zipcodeNameHidden').value;
    const county = isDataObject ? dataObject.countyIdHidden : document.getElementById('countyIdHidden').value;
    const street = isDataObject ? dataObject.pstreetIdHidden : document.getElementById('pstreetIdHidden').value;
    const city = isDataObject ? dataObject.pcityIdHidden : document.getElementById('pcityIdHidden').value;
    const jurisdiction = isDataObject ? dataObject['city-limitsIdHidden'] : document.getElementById('city-limitsIdHidden').value;
    const permits = isDataObject ? dataObject['construction-permitsIdHidden'] : document.getElementById('construction-permitsIdHidden').value;
    const cases = isDataObject ? dataObject['site-plan-reviewIdHidden'] : document.getElementById('site-plan-reviewIdHidden').value;
    const zoningDistrict = isDataObject ? dataObject['zoning-districtIdHidden'] : document.getElementById('zoning-districtIdHidden').value;
    const zoningOverlay = isDataObject ? dataObject['zoning-overlayIdHidden'] : document.getElementById('zoning-overlayIdHidden').value;
    const zoningReview = isDataObject ? dataObject['zoning-reviewIdHidden'] : document.getElementById('zoning-reviewIdHidden').value;
    const education = isDataObject ? dataObject.educationIdHidden : document.getElementById('educationIdHidden').value;
    const mls = isDataObject ? dataObject.mlsIdHidden : document.getElementById('mlsIdHidden').value;
    const owner = isDataObject ? dataObject.ownerIdHidden : document.getElementById('ownerIdHidden').value;
    const fdf = isDataObject ? dataObject.fdfIdHidden : document.getElementById('fdfIdHidden').value;
    const subdivision = isDataObject ? dataObject.subdivisionIdHidden : document.getElementById('subdivisionIdHidden').value;
    let opportunityZones;
    if (isDataObject) {
        opportunityZones = dataObject.opportunity ? dataObject.opportunityIn ? 1 : -1 : '';
    } else {
        opportunityZones = document.getElementById('opportunity').checked ? document.getElementById('opportunityIn').checked ? 1 : -1 : '';
    }
    let affordable;
    if (isDataObject) {
        affordable = dataObject.affordableIn ? 1 : dataObject.affordableOut ? -1 : 0;
    } else {
        affordable = document.getElementById('affordableIn').checked ? 1 : document.getElementById('affordableOut').checked ? -1 : 0;
    }
    let floodplain = '';
    if (isDataObject) {
        if (dataObject.floodplain) {
            floodplain = 0;
        } else {
            const f100 = dataObject.fl100;
            const f500 = dataObject.fl500;
            if (f100 && f500) {
                floodplain = 3;
            } else if (f100 && !f500) {
                floodplain = 1;
            } else if (!f100 && f500) {
                floodplain = 2;
            }
        }
    } else {
        if (document.getElementById('floodplain').checked) {
            floodplain = 0;
        } else {
            const f100 = document.getElementById('fl100').checked;
            const f500 = document.getElementById('fl500').checked;
            if (f100 && f500) {
                floodplain = 3;
            } else if (f100 && !f500) {
                floodplain = 1;
            } else if (!f100 && f500) {
                floodplain = 2;
            }
        }
    }

    let urlParam = '';
    const urlParamStorage = {};
    if (county) {
        urlParam += `&filter[county]=${county}`;
    }
    if (street) {
        urlParam += `&filter[street_filter]=${street}`;
    }
    if (zipcode) {
        urlParam += `&filter[zip_code]=${zipcode}`;
    }
    if (city) {
        urlParam += `&filter[address]=${city}`;
    }
    if (jurisdiction) {
        urlParam += `&filter[jurisdiction]=${jurisdiction}`;
    }
    if (permits) {
        urlParam += `&filter[permits]=${permits}`;
    }
    if (cases) {
        urlParam += `&filter[site_plan]=${cases}`;
    }
    if (opportunityZones) {
        urlParam += `&filter[opportunity_zone]=${opportunityZones}`;
    }
    if (zoningDistrict) {
        urlParam += `&filter[zoning_district]=${zoningDistrict}`;
    }
    if (zoningOverlay) {
        urlParam += `&filter[zoning_overlay]=${zoningOverlay}`;
    }
    if (zoningReview) {
        urlParam += `&filter[zoning_review]=${zoningReview}`;
    }
    if (education) {
        urlParam += `&filter[education]=${education}`;
    }
    if (mls) {
        urlParam += `&filter[mls]=${mls}`;
    }
    if (owner) {
        urlParam += `&filter[owner]=${owner}`;
    }
    if (fdf) {
        urlParam += `&filter[fdf]=${fdf}`;
    }
    if (subdivision) {
        urlParam += `&filter[subdivision]=${subdivision}`;
    }
    if (floodplain) {
        urlParam += `&filter[floodplain]=${floodplain}`;
    }
    if (affordable) {
        urlParam += `&filter[affordable]=${affordable}`;
    }

    return { url: urlParam, data: urlParamStorage };
};

export const saveToStorage = msa => {
    const dataForStorage = {};
    const formEl = ['text', 'hidden', 'checkbox', 'radio'];
    formEl.forEach(elSelector => {
        const elArray = document.getElementById('Filter').querySelectorAll(`input[type="${elSelector}"]`);
        Array.prototype.map.call(elArray, function (el) {
            if (el.getAttribute('data-filter')) {
                if (elSelector === 'checkbox' || elSelector === 'radio') {
                    dataForStorage[el.getAttribute('id')] = el.checked;
                } else {
                    dataForStorage[el.getAttribute('id')] = el.value;
                }
            }
        });
    });
    mapStorage.set(`filter_data_${msa}`, JSON.stringify(dataForStorage));
};

class Filter {
    init (selectedMsa, map) {
        this.initFilter(selectedMsa, map);
    }

    doFilter (dataObject = '', type = '') {
        const msa = document.getElementById('filterMsa').value;
        let urlParams;
        if (type === 'favorite') {
            urlParams = generateFilterParams(dataObject);
        } else {
            urlParams = generateFilterParams();
        }
        const urlParam = urlParams.url;
        const filterParam = [];

        if (urlParam === '') {
            message.error('Please add additional criteria to your filter request.');
        } else {
            loader.show();
        }
        document.getElementById('searchStrParam').innerHTML = urlParams.url;
        doRequestJSON('GET', `/api/${msa}/filterCountProperty?msa=${msa}${urlParam}`)
            .then((result) => {
                if (result[0].id_cnt > 0 && result[0].id_cnt < 10000) {
                    document.getElementById('filterResultCnt').value = result[0].id_cnt;
                    document.getElementById('filterResultParcelsCnt').value = result[0].parcel_id_cnt;

                    // get parcesl for features on map
                    doRequestJSON('GET', `/api/${msa}/filterParcels?msa=${msa}${urlParam}`, filterParam)
                        .then(async filteredProperties => {
                            try {
                                const restoredProperties = JSON.parse(pako.inflate(filteredProperties, { to: 'string' }));
                                mbmap.removeFeatureState({
                                    source: 'parcels',
                                    sourceLayer: 'parcels'
                                });
                                restoredProperties.forEach(property => {
                                    // eslint-disable-next-line no-undef
                                    mbmap.setFeatureState({
                                        source: 'parcels',
                                        sourceLayer: 'parcels',
                                        id: property.parcel_id
                                    }, {
                                        filtered: true
                                    });
                                });
                                mbmap.queryRenderedFeatures();

                                const orderKey = document.getElementById('order-select').value;
                                const sortType = document.querySelector('input[name="typeOrder"]:checked').value;
                                doRequestJSON('GET', `/api/${msa}/filterProperty?msa=${msa}${urlParam}&page=1&orderBy=${orderKey}&sort=${sortType}`)
                                    .then((resultData) => {
                                        document.getElementById('filterContent').classList.remove('w3-hide');
                                        document.getElementById('filterResultTable').innerHTML = '';
                                        document.getElementById('filterResultTable').classList.remove('w3-hide');
                                        // eslint-disable-next-line no-undef
                                        document.getElementById('filterResultTable').append(filterResultTable(resultData, mbmap, true));
                                        document.getElementById('filterResultSort').classList.remove('w3-hide');
                                        document.getElementById('filterExport').classList.remove('w3-hide');
                                        document.getElementById('saveToFavorits').classList.remove('w3-hide');
                                        document.getElementById('doDownload').classList.add('w3-hidden');
                                        generatePagination(1, result[0].id_cnt);
                                        if (document.getElementsByClassName('ui-table')[0].offsetWidth < document.getElementById('background').offsetWidth) {
                                            document.getElementsByClassName('table-wrapper')[0].style.display = 'inline-block';
                                            document.getElementById('filterResult').setAttribute('data-display', 'inline-block');
                                        } else {
                                            document.getElementsByClassName('table-wrapper')[0].style.display = 'inherit';
                                            document.getElementById('filterResult').setAttribute('data-display', 'block');
                                        }
                                        document.getElementById('filterResultTblCnt').innerHTML = result[0].id_cnt;
                                    })
                                    .catch((e) => {
                                        console.error(e.message);
                                    });
                            } catch (e) {

                            }
                        })
                        .catch(e => {
                            loader.hide();
                            if (String(e.message) === String(401)) {
                                doRequestJSON('GET', '/auth/refresh-token')
                                    .then((result) => {
                                        const { redirectTo } = result;
                                        if (redirectTo) {
                                            window.location = redirectTo;
                                        }
                                    })
                                    .catch((e) => {
                                        console.error(e.message);
                                    });
                            }
                        });
                } else {
                    loader.hide();
                    document.getElementById('filterResultTable').innerHTML = '';
                    document.getElementById('filterContent').classList.add('w3-hide');
                    document.getElementById('filterResultTable').classList.add('w3-hide');
                    document.getElementById('filterResultPagination').classList.add('w3-hide');
                    message.info('Please add additional criteria to your filter request.');
                }
            })
            .catch(e => {
                loader.hide();
                if (String(e.message) === String(401)) {
                    doRequestJSON('GET', '/auth/refresh-token')
                        .then((result) => {
                            const { redirectTo } = result;
                            if (redirectTo) {
                                window.location = redirectTo;
                            }
                        })
                        .catch((e) => {
                            console.error(e.message);
                        });
                }
            });
    };

    initDateRangePickers () {
        document.querySelector('.reportrange');
        const elPickers = document.getElementById('Filter').querySelectorAll('.fa-calendar');
        Array.prototype.map.call(elPickers, function (el) {
            const parentDiv = el.parentNode;
            const elSectionParent = el.parentNode.closest('section');
            const divRange = document.createElement('div');
            divRange.className = 'w3-light-gray w3-border w3-border-gray w3-hover-border-theme w3-hide w3-round calendar-dropdown';
            divRange.setAttribute('id', `range-${parentDiv.getAttribute('data-element')}`);
            let ulRange = '<ul>';
            ulRange += `
                <li data-id="clear">
                    <a class="w3-bar-item w3-button w3-round w3-padding-small w3-hover-none clear-date" href="javascript:;">Clear interval</a>
                </li>
                <li data-id="1">
                    <a class="w3-bar-item w3-button w3-round w3-padding-small w3-hover-none" 
                        href="javascript:;" 
                        data-range="${moment().format('Y-MM-D')} -- ${moment().format('Y-MM-D')}">Today
                    </a>
                </li>
                <li data-id="2">
                    <a class="w3-bar-item w3-button w3-round w3-padding-small w3-hover-none" 
                        href="javascript:;" 
                        data-range="${moment().subtract(30, 'days').format('Y-MM-D')} -- ${moment().format('Y-MM-D')}">Last 30 Days
                    </a>
                </li>
                <li data-id="3">
                    <a class="w3-bar-item w3-button w3-round w3-padding-small w3-hover-none" 
                        href="javascript:;" 
                        data-range="${moment().subtract(60, 'days').format('Y-MM-D')} -- ${moment().format('Y-MM-D')}">
                        Last 60 Days
                    </a>
                </li>
                <li data-id="4">
                    <a class="w3-bar-item w3-button w3-round w3-padding-small w3-hover-none" 
                        href="javascript:;" 
                        data-range="${moment().subtract(90, 'days').format('Y-MM-D')} -- ${moment().format('Y-MM-D')}">
                        Last 90 Days
                    </a>
                </li>
                <li data-id="5">
                    <a class="w3-bar-item w3-button w3-round w3-padding-small w3-hover-none" 
                        href="javascript:;" 
                        data-range="${moment().subtract(6, 'months').format('Y-MM-D')} -- ${moment().format('Y-MM-D')}">
                        Last 6 Months
                    </a>
                </li>
                <li data-id="6">
                    <a class="w3-bar-item w3-button w3-round w3-padding-small w3-hover-none" 
                        href="javascript:;" data-range="${moment().subtract(9, 'months').format('Y-MM-D')} -- ${moment().format('Y-MM-D')}">
                        Last 9 Months
                    </a>
                </li>
                <li data-id="7">
                    <a class="w3-bar-item w3-button w3-round w3-padding-small w3-hover-none" 
                        href="javascript:;" 
                        data-range="${moment().subtract(12, 'months').format('Y-MM-D')} -- ${moment().format('Y-MM-D')}">
                        Last Year
                    </a>
                </li>
                <li data-id="8">
                    <a class="w3-bar-item w3-button w3-round w3-padding-small w3-hover-none" 
                        href="javascript:;" 
                        data-range="${moment().subtract(2, 'years').format('Y-MM-D')} -- ${moment().format('Y-MM-D')}">
                        Last 2 Years
                    </a>
                </li>
                <li data-id="9">
                    <a class="w3-bar-item w3-button w3-round w3-padding-small w3-hover-none" 
                        href="javascript:;" 
                        data-range="${moment().subtract(5, 'years').format('Y-MM-D')} -- ${moment().format('Y-MM-D')}">
                        Last 5 Years
                    </a>
                </li>
                <li data-id="10">
                    <a class="w3-bar-item w3-button w3-round w3-padding-small w3-hover-none" 
                        href="javascript:;" 
                        data-range="${moment().subtract(10, 'years').format('Y-MM-D')} -- ${moment().format('Y-MM-D')}">
                        Last 10 Years
                    </a>
                </li>
                <li data-id="custom">
                    <a class="w3-bar-item w3-button w3-round w3-padding-small w3-hover-none custom-picker" href="javascript:;">Custom range</a>
                </li>
                `;
            ulRange += '<ul>';
            divRange.insertAdjacentHTML('beforeend', ulRange);
            el.parentNode.append(divRange);
            // eslint-disable-next-line no-new
            new Litepicker({
                element: parentDiv.querySelector('.pick-date'),
                startDate: new Date(),
                numberOfMonths: 2,
                format: 'YYYY-MM-DD',
                singleMode: false,
                setup: (picker) => {
                    picker.on('preselect', (date1, date2) => {
                        parentDiv.querySelector('.selected-date-range').value = `${moment(date1).format('Y-MM-DD')} -- ${moment(date2).format('Y-MM-DD')}`;
                    });
                }
            });

            const dataLinks = el.parentNode.querySelector('.calendar-dropdown').querySelectorAll('a');
            Array.prototype.map.call(dataLinks, function (link) {
                link.onclick = function (eLink) {
                    if (eLink.target.classList.contains('custom-picker')) {
                        const event = new Event('click');
                        parentDiv.querySelector('.pick-date').disabled = false;
                        parentDiv.querySelector('.pick-date').dispatchEvent(event);
                    } else if (eLink.target.classList.contains('clear-date')) {
                        parentDiv.querySelector('.selected-date-range').value = '';
                        parentDiv.querySelector('.calendar-dropdown').classList.add('w3-hide');
                    } else {
                        parentDiv.querySelector('.selected-date-range').value = eLink.target.getAttribute('data-range');
                        parentDiv.querySelector('.calendar-dropdown').classList.add('w3-hide');
                    }
                };
            });

            el.addEventListener('click', function (e) {
                if (!e.target.classList.contains('disabled')) {
                    Array.prototype.map.call(elSectionParent.querySelectorAll('.calendar-dropdown'), function (elP) {
                        if (elP !== parentDiv.querySelector('.calendar-dropdown')) {
                            elP.classList.add('w3-hide');
                        }
                    });
                    document.getElementById(`range-${parentDiv.getAttribute('data-element')}`).classList.toggle('w3-hide');
                }
            }, false);
        });
    }

    initSelect (selectedMsa, mbmap) {
        const selectFilterTypes = document.getElementById('filter-select');
        selectFilterTypes.customSelect.destroy();
        for (let i = selectFilterTypes.length - 1; i >= 0; i--) {
            selectFilterTypes.remove(i);
        }

        const selectFilterOrder = document.getElementById('order-select');
        selectFilterOrder.customSelect.destroy();
        for (let i = selectFilterOrder.length - 1; i >= 0; i--) {
            selectFilterOrder.remove(i);
        }

        const selectForClear = [
            'filter-construction-permits-status-select',
            'filter-construction-permits-work-class-select',
            'filter-site-plan-review-status-select',
            'filter-zoning-review-status-select'
        ];

        selectForClear.forEach(select => {
            const selectFilter = document.getElementById(select);
            for (let i = selectFilter.length - 1; i > 0; i--) {
                selectFilter.remove(i);
            }
        });
        const filterOptions = [];
        const sortableOptions = [];
        mbmap.msaStyle.layers.forEach(layer => {
            if (layer.info.filter_key) {
                filterOptions.push({
                    key: layer.info.filter_key,
                    title: layer.info.filter_title,
                    layer: layer.info.layer_name
                });
            }
            if (layer.info.order_title) {
                sortableOptions.push({
                    key: layer.info.layer_name,
                    title: layer.info.order_title,
                    sort_key: layer.info.order_key
                });
            }
        });
        filterOptions.sort(function (a, b) {
            const keyA = (a.title);
                const keyB = (b.title);
            if (keyA < keyB) return -1;
            if (keyA > keyB) return 1;
            return 0;
        });
        sortableOptions.sort(function (a, b) {
            const keyA = (a.title);
                const keyB = (b.title);
            if (keyA < keyB) return -1;
            if (keyA > keyB) return 1;
            return 0;
        });

        Object.keys(filterOptions).forEach(function (key) {
            const opt = document.createElement('option');
            opt.value = filterOptions[key].key;
            opt.text = filterOptions[key].title;
            opt.setAttribute('filter_layer', filterOptions[key].layer);
            selectFilterTypes.add(opt, null);
        });
        customSelect(selectFilterTypes);

        // generate select dropdown filter
        Object.keys(sortableOptions).forEach(function (key) {
            const opt = document.createElement('option');
            const optGroup = document.createElement('optgroup');
            if (typeof (sortableOptions[key].sort_key) === 'object') {
                optGroup.setAttribute('label', sortableOptions[key].title);
                const sortFields = sortableOptions[key].sort_key;
                Object.keys(sortFields).forEach(sort => {
                    const optG = document.createElement('option');
                    optG.value = sort;
                    optG.text = sortFields[sort];
                    optGroup.appendChild(optG);
                });
                selectFilterOrder.add(optGroup, null);
            } else {
                opt.value = sortableOptions[key].sort_key;
                opt.text = sortableOptions[key].title;
                selectFilterOrder.add(opt, null);
            }
        });
        selectFilterOrder.value = 'property_id';
        customSelect(selectFilterOrder);

        const options = selectFilterOrder.options;
        const selectedIndex = selectFilterOrder.selectedIndex;
        const optGroup = options[selectedIndex].parentNode;
        if (optGroup.label) {
            document.getElementById('filterResultSort').querySelector('span.custom-select-opener').innerHTML = `<span>${optGroup.label} - ${options[selectedIndex].text}</span>`;
        }

        if (filterOptions.length === 0) {
            document.getElementById('filterLink').classList.add('disabled');
        } else {
            document.getElementById('filterLink').classList.remove('disabled');
        }

        this.filterOptions = filterOptions;
    }

    initFilter (selectedMsa, mbmap) {
        document.getElementById('filterMsa').value = selectedMsa;
        document.getElementById('doFilter').onclick = this.doFilter;
        document.getElementById('doSort').onclick = doSort;
        document.getElementById('filterClear').onclick = this.clearFilterData;
        document.getElementById('saveToFavorits').onclick = showFavoritForm;
        document.getElementById('cancelSaveFavorites').onclick = hideFavoritForm;
        document.getElementById('saveSearchToFavorits').onclick = saveToFavorits;

        // init calendar
        this.initDateRangePickers();
        this.addToCloud();
        this.addToCloudMulti();
        this.addToCloudLiveInputs();

        // Interaction
        this.initLiveInputs();

        // API
        this.changeFilter();
        this.changeSort();
        streetInput();
        zipInput();
        countyInput();
        mlsInput();
        floodplainFDInput();
        educationInput();
        ownerInput();
        zoningDistrictInput();
        zoningOverlayInput();
        cityInput();
    }

    restoreFromStorage (mbmap) {
        const $this = this;
        if (mapStorage.get(`filter_data_${mbmap.msa}`)) {
            const filterStorageSettings = JSON.parse(mapStorage.get(`filter_data_${mbmap.msa}`));
            Object.keys(filterStorageSettings).forEach(key => {
                switch (key) {
                    case 'affordableIn':
                    case 'affordableOut':
                        document.getElementById(key).checked = filterStorageSettings[key];
                        if (filterStorageSettings[key]) {
                            document.getElementById('ah1').checked = true;
                        }
                        break;
                    default:
                        document.getElementById(key).value = filterStorageSettings[key];
                }
            });
            const countyList = document.getElementById('countyNameHidden').value ? JSON.parse(document.getElementById('countyNameHidden').value).join('&nbsp;<em>or</em>&nbsp;&nbsp;') : '';
            const ownerList = document.getElementById('ownerNameHidden').value ? JSON.parse(document.getElementById('ownerNameHidden').value).join(' <em>or</em>&nbsp;&nbsp;') : '';
            const zipList = document.getElementById('zipcodeIdHidden').value ? JSON.parse(document.getElementById('zipcodeNameHidden').value).join(' <em>or</em>&nbsp;&nbsp;') : '';
            const cityList = document.getElementById('pcityNameHidden').value ? JSON.parse(document.getElementById('pcityNameHidden').value).join(' <em>or</em>&nbsp;&nbsp;') : '';
            const educationList = document.getElementById('educationNameHidden').value ? JSON.parse(document.getElementById('educationNameHidden').value).join(' <em>or</em>&nbsp;&nbsp;') : '';
            const mlsList = document.getElementById('mlsNameHidden').value ? JSON.parse(document.getElementById('mlsNameHidden').value).join(' <em>or</em>&nbsp;&nbsp;') : '';
            const zoningDList = document.getElementById('zoning-districtNameHidden').value ? JSON.parse(document.getElementById('zoning-districtNameHidden').value).join(' <em>or</em>&nbsp;&nbsp;') : '';
            const zoningOList = document.getElementById('zoning-overlayNameHidden').value ? JSON.parse(document.getElementById('zoning-overlayNameHidden').value).join(' <em>or</em>&nbsp;&nbsp;') : '';
            const jurisdictionList = document.getElementById('city-limitsNameHidden').value ? JSON.parse(document.getElementById('city-limitsNameHidden').value).join('&nbsp;<em>or</em>&nbsp;&nbsp;') : '';
            const fdfList = document.getElementById('fdfNameHidden').value ? JSON.parse(document.getElementById('fdfNameHidden').value).join('&nbsp;<em>or</em>&nbsp;&nbsp;') : '';

            Object.keys(filterStorageSettings).forEach(key => {
                switch (key) {
                    case 'countyIdHidden':
                        $this.toCloud(
                            'county',
                             'County: ',
                            countyList
                        );
                        break;
                    case 'affordableIn':
                    case 'affordableOut':
                        if (filterStorageSettings.affordableIn === true) {
                            const textA = ' Yes ';
                            this.toCloud('affordable', 'Affordable housing: ', '');
                            this.toCloud('affordable', 'Affordable housing: ', textA);
                        }
                        if (filterStorageSettings.affordableOut === true) {
                            const textA = ' No ';
                            this.toCloud('affordable', 'Affordable housing: ', '');
                            this.toCloud('affordable', 'Affordable housing: ', textA);
                        }
                        break;
                    case 'ownerIdHidden':
                        $this.toCloud(
                            'owner',
                            'Owner: ',
                            ownerList
                        );
                        break;
                    case 'zipcodeIdHidden':
                        $this.toCloud('zipcode', 'Zip code: ', zipList);
                        break;
                    case 'pcityIdHidden':
                        $this.toCloud('pcity', 'City: ', cityList);
                        break;
                    case 'educationIdHidden':
                        $this.toCloud(
                            'education',
                            'Independent School District: ',
                            educationList
                        );
                        break;
                    case 'mlsIdHidden':
                        $this.toCloud(
                            'mls',
                            'Multiple Listing Service Area: ',
                            mlsList
                        );
                        break;
                    case 'zoning-districtNameHidden':
                        $this.toCloud(
                            'zoning-district',
                            'Zoning Districts: ',
                            zoningDList
                        );
                        break;
                    case 'zoning-overlayNameHidden':
                        $this.toCloud(
                            'zoning-overlay',
                            'Zoning Overlay: ',
                            zoningOList
                        );
                        break;
                    case 'city-limitsNameHidden':
                        $this.toCloud('city-limits', 'City limits: ', jurisdictionList);
                        break;
                    case 'fdfNameHidden':
                        $this.toCloud(
                            'fdf',
                            'Fully Developed Floodplain: ',
                            fdfList
                        );
                        break;
                    case 'pstreet':
                        document.getElementById('pstreet').dispatchEvent(new Event('click'));
                        break;
                    default:
                        break;
                }
            });
        }
    }

    clearFilterData () {
        const selectedMsa = document.getElementById('filterMsa').value;
        // clear hidden values
        const formEl = ['text', 'hidden', 'checkbox', 'radio'];
        formEl.forEach(elSelector => {
            const elArray = document.getElementById('Filter').querySelectorAll(`input[type="${elSelector}"]`);
            Array.prototype.map.call(elArray, function (el) {
                if (elSelector === 'checkbox' || elSelector === 'radio') {
                    el.checked = false;
                } else {
                    el.value = '';
                }
            });
        });

        const elClearHtml = ['.street-list', '.input-search-options'];
        elClearHtml.forEach(elSelector => {
            const elArray = document.getElementById('Filter').querySelectorAll(elSelector);
            Array.prototype.map.call(elArray, function (el) {
                el.innerHTML = '';
            });
        });

        const elRomove = ['.cloud-item'];
        elRomove.forEach(elSelector => {
            const elArray = document.getElementById('Filter').querySelectorAll(elSelector);
            Array.prototype.map.call(elArray, function (el) {
                el.remove();
            });
        });

        document.getElementsByClassName('filter-cloud')[0].style.display = 'none';
        document.getElementById('filterResultTable').innerHTML = '';
        document.getElementById('filterResultPagination').innerHTML = '';
        document.getElementById('streetList').innerHTML = '';
        document.getElementById('filterContent').classList.add('w3-hide');
        document.getElementById('filterResultTable').classList.add('w3-hide');
        document.getElementById('filterResultSort').classList.add('w3-hide');
        document.getElementById('saveToFavorits').classList.add('w3-hide');
        document.getElementById('filterExport').classList.add('w3-hide');
        document.getElementById('filterResultPagination').classList.add('w3-hide');
        document.getElementById('filterMsa').value = selectedMsa;
        document.getElementById('filterClear').classList.add('disabled-clear');

        generateCriteria(document.getElementById('filter-select').value);
    }

    clearFilter (selectedMsa, mbmap) {
        this.initSelect(selectedMsa, mbmap);
        document.getElementById('infoLink').classList.remove('active');

        this.clearFilterData();

        if (document.getElementById('filter-select')) {
            document.getElementById('filter-select').value = 'county';
            const event = new Event('change');
            document.getElementById('filter-select').dispatchEvent(event);
        }

        document.getElementById('filterMsa').value = selectedMsa;
        document.getElementById('filterClear').classList.add('disabled-clear');
        document.getElementById('streetList').innerHTML = '';
        document.getElementById('streetList').style.height = 'auto';
        document.getElementById('filterTypeOrderAsc').checked = true;
        document.getElementById('filterResultCnt').value = 0;
        document.getElementById('filterResultParcelsCnt').value = 0;
    }

    removeAddress (evt, streetName, parentId, filter) {
        const selStreetHidden = JSON.parse(document.getElementById('pstreetIdHidden').value);
        const indx = selStreetHidden.findIndex(fkey => fkey.street_name === streetName);
        if (indx >= 0) {
            selStreetHidden.splice(indx, 1);
        }
        document.getElementById('pstreetIdHidden').value = selStreetHidden.length > 0 ? JSON.stringify(selStreetHidden) : '';
        // clear filter parameters for connected filter
        const chks = document.querySelectorAll(`input[type='checkbox'][value='${streetName}']`);
        if (chks.length > 0) {
            chks[0].checked = false;
        }
        document.getElementById(parentId).remove();
        filter.prepareAddressses();
    }

    setInputFilter (textbox, inputFilter) {
        ['input', 'keydown', 'keyup', 'mousedown', 'mouseup', 'select', 'contextmenu', 'drop'].forEach(function (event) {
            textbox.addEventListener(event, function () {
                if (inputFilter(this.value)) {
                    this.oldValue = this.value;
                    this.oldSelectionStart = this.selectionStart;
                    this.oldSelectionEnd = this.selectionEnd;
                    // eslint-disable-next-line no-prototype-builtins
                } else if (this.hasOwnProperty('oldValue')) {
                    this.value = this.oldValue;
                    this.setSelectionRange(this.oldSelectionStart, this.oldSelectionEnd);
                } else {
                    this.value = '';
                }
            });
        });
    }

    changeHouseRange (evt, streetName, parentId, type, filter) {
        const selStreetHidden = JSON.parse(document.getElementById('pstreetIdHidden').value);
        const indx = selStreetHidden.findIndex(fkey => fkey.street_name === streetName);
        let hasError = false;
        if (indx >= 0) {
            const minVal = document.getElementById(parentId).querySelectorAll(`input[name="${type}"]`)[0].getAttribute('min');
            const maxVal = document.getElementById(parentId).querySelectorAll(`input[name="${type}"]`)[0].getAttribute('max');
            const inptValue = document.getElementById(parentId).querySelectorAll(`input[name="${type}"]`)[0].value;
            if (type === 'houseFrom') {
                document.getElementById(parentId).querySelectorAll(`input[name="${type}"]`)[0].value = inptValue.replace(/[^0-9]/g, '');
                document.getElementById(parentId).querySelectorAll('span.error-house-from')[0].innerHTML = '';
                if (parseInt(inptValue.replace(/[^0-9]/g, '')) < minVal) {
                    document.getElementById(parentId).querySelectorAll('span.error-house-from')[0].innerHTML = `min ${minVal}`;
                    hasError = true;
                } else if (parseInt(inptValue.replace(/[^0-9]/g, '')) > maxVal) {
                    document.getElementById(parentId).querySelectorAll('span.error-house-from')[0].innerHTML = `max ${maxVal}`;
                    hasError = true;
                }

                selStreetHidden[indx].min = document.getElementById(parentId).querySelectorAll(`input[name="${type}"]`)[0].value;
            } else {
                document.getElementById(parentId).querySelectorAll(`input[name="${type}"]`)[0].value = inptValue.replace(/[^0-9]/g, '');
                document.getElementById(parentId).querySelectorAll('span.error-house-to')[0].innerHTML = '';
                if (parseInt(inptValue.replace(/[^0-9]/g, '')) < minVal) {
                    document.getElementById(parentId).querySelectorAll('span.error-house-to')[0].innerHTML = `min ${minVal}`;
                    hasError = true;
                } else if (parseInt(inptValue.replace(/[^0-9]/g, '')) > maxVal) {
                    document.getElementById(parentId).querySelectorAll('span.error-house-to')[0].innerHTML = `max ${maxVal}`;
                    hasError = true;
                }
                selStreetHidden[indx].max = document.getElementById(parentId).querySelectorAll(`input[name="${type}"]`)[0].value;
            }

            if (hasError) {
                document.getElementById(parentId).querySelector('.error-row').classList.remove('w3-hide');
            } else {
                document.getElementById(parentId).querySelector('.error-row').classList.add('w3-hide');
            }
        }
        document.getElementById('pstreetIdHidden').value = JSON.stringify(selStreetHidden);
        filter.prepareAddressses();
    }

    prepareAddressses () {
        const streetStr = [];
        if (document.getElementById('pstreetIdHidden').value) {
            JSON.parse(document.getElementById('pstreetIdHidden').value).forEach(street => {
                streetStr.push(`${this.capitalizeWords(street.street_name)} [${street.min} - ${street.max}]`);
            });
            this.toCloud('pstreet', 'Street: ', streetStr.join('; '));
        } else {
            // remove street cloud
            const cloud = document.getElementById('filter-cloud');
            const cloudItem = document.getElementById('cloud-pstreet');
            cloudItem.remove();

            if (!cloud.querySelector('span')) {
                document.getElementById('filter-cloud').style.display = 'none';
                document.getElementsByClassName('filter-cloud')[0].style.display = 'none';
            } else {
                document.getElementById('filter-cloud').style.display = 'block';
                document.getElementsByClassName('filter-cloud')[0].style.display = 'block';
            }
        }
    }

    preparePermits () {
        const permitsStr = [];
        JSON.parse(document.getElementById('construction-permitsHidden').value).forEach(permits => {
            permitsStr.push(`${permits.date}, ${permits.status}, ${permits.work}`);
        });
        this.toCloud('construction-permits', 'Construction permits: ', permitsStr.join('; '));
    }

    changeSort () {
        document.getElementById('order-select').addEventListener('change', function (e) {
            const options = document.getElementById('order-select').options;
            const selectedIndex = document.getElementById('order-select').selectedIndex;
            const optGroup = options[selectedIndex].parentNode;
            if (optGroup.label) {
                document.getElementById('filterResultSort').querySelector('span.custom-select-opener').innerHTML = `<span>${optGroup.label} - ${options[selectedIndex].text}</span>`;
            }
        });
    }

    changeFilter () {
        // eslint-disable-next-line no-unused-vars
        const $this = this;
        document.getElementById('filter-select').addEventListener('change', function () {
            const val = this.value;
            Array.prototype.map.call(document.getElementsByClassName('filter-section'), function (el) {
                el.style.display = 'none';
            });
            if (document.getElementById(`filter-${val}`)) {
                document.getElementById(`filter-${val}`).style.display = 'block';
            }
            generateCriteria(val);
        });
    }

    capitalizeWords (str) {
        return str.replace(/\w\S*/g, function (txt) {
            return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
        });
    }

    addToCloudCheckboxes (target, name, prefix) {
        const elNameHidden = document.getElementById(`${name}NameHidden`);
        const elIdHidden = document.getElementById(`${name}IdHidden`);
        const checkedIds = elIdHidden.value ? JSON.parse(elIdHidden.value) : [];
        const checkedNames = elNameHidden.value ? JSON.parse(elNameHidden.value) : [];
        const chkbxEl = document.getElementById(target.getAttribute('id'));
        const elId = parseInt(chkbxEl.getAttribute('id').replace(`${prefix}-`, ''));
        if (chkbxEl.checked) {
            checkedIds.push(elId);
            checkedNames.push(chkbxEl.value);
        } else {
            const indx = checkedIds.indexOf(elId);
            if (indx >= 0) {
                checkedIds.splice(indx, 1);
                checkedNames.splice(indx, 1);
            }
        }
        elIdHidden.value = checkedIds.length > 0 ? JSON.stringify(checkedIds) : '';
        elNameHidden.value = checkedNames.length > 0 ? JSON.stringify(checkedNames) : '';
    }

    addToCloudSigledCheckboxes (name) {
        const checkedListIds = [...document.querySelectorAll(`input[name=${name}]:checked`)].map(e => parseInt(e.getAttribute('id').replace(`${name}-`, '')));
        const checkedListNames = [...document.querySelectorAll(`input[name=${name}]:checked`)].map(e => e.value);

        document.getElementById(`${name}IdHidden`).value = checkedListIds.length > 0 ? JSON.stringify(checkedListIds) : '';
        document.getElementById(`${name}NameHidden`).value = checkedListNames.length > 0 ? JSON.stringify(checkedListNames) : '';
    }

    addToCloudLiveInputs () {
        const $this = this;
        const liveCheckboxArr = document.querySelectorAll('.input-search-options input');

        if (liveCheckboxArr.length > 0) {
            liveCheckboxArr.forEach(function (ckbx) {
                ckbx.addEventListener('change', (evt) => {
                    const target = evt.target;
                        const optionsContainer = evt.target.closest('.input-search-options');
                        const parentInput = optionsContainer.previousElementSibling;
                        const currentOption = parentInput.getAttribute('id');
                    switch (currentOption) {
                    case 'zipcode':
                        $this.addToCloudCheckboxes(target, 'zipcode', 'zip');
                        // eslint-disable-next-line no-case-declarations
                        const zipList = document.getElementById('zipcodeIdHidden').value ? JSON.parse(document.getElementById('zipcodeNameHidden').value).join(' <em>or</em>&nbsp;&nbsp;') : '';
                        $this.toCloud('zipcode', 'Zip code: ', zipList);
                        break;
                    case 'pcity':
                        $this.addToCloudCheckboxes(target, 'pcity', 'city');
                        // eslint-disable-next-line no-case-declarations
                        const cityList = document.getElementById('pcityNameHidden').value ? JSON.parse(document.getElementById('pcityNameHidden').value).join(' <em>or</em>&nbsp;&nbsp;') : '';
                        $this.toCloud('pcity', 'City: ', cityList);
                        break;
                    case 'education':
                        $this.addToCloudCheckboxes(target, 'education', 'education');
                        // eslint-disable-next-line no-case-declarations
                        const educationList = document.getElementById('educationNameHidden').value ? JSON.parse(document.getElementById('educationNameHidden').value).join(' <em>or</em>&nbsp;&nbsp;') : '';
                        $this.toCloud(
                            parentInput.getAttribute('id'),
                            parentInput.getAttribute('data-placeholder') ? parentInput.getAttribute('data-placeholder') + ': ' : parentInput.getAttribute('placeholder') + ': ',
                            educationList
                        );
                        break;
                    case 'mls':
                        $this.addToCloudCheckboxes(target, 'mls', 'mls');
                        // eslint-disable-next-line no-case-declarations
                        const mlsList = document.getElementById('mlsNameHidden').value ? JSON.parse(document.getElementById('mlsNameHidden').value).join(' <em>or</em>&nbsp;&nbsp;') : '';
                        $this.toCloud(
                            parentInput.getAttribute('id'),
                            parentInput.getAttribute('data-placeholder') ? parentInput.getAttribute('data-placeholder') + ': ' : parentInput.getAttribute('placeholder') + ': ',
                            mlsList
                        );
                        break;
                    case 'zoning-district':
                        $this.addToCloudCheckboxes(target, 'zoning-district', 'zoning-district');
                        // eslint-disable-next-line no-case-declarations
                        const zoningDList = document.getElementById('zoning-districtNameHidden').value ? JSON.parse(document.getElementById('zoning-districtNameHidden').value).join(' <em>or</em>&nbsp;&nbsp;') : '';
                        $this.toCloud(
                            parentInput.getAttribute('id'),
                            parentInput.getAttribute('data-placeholder') ? parentInput.getAttribute('data-placeholder') + ': ' : parentInput.getAttribute('placeholder') + ': ',
                            zoningDList
                        );
                        break;
                    case 'zoning-overlay':
                        $this.addToCloudCheckboxes(target, 'zoning-overlay', 'zoning-overlay');
                        // eslint-disable-next-line no-case-declarations
                        const zoningOList = document.getElementById('zoning-overlayNameHidden').value ? JSON.parse(document.getElementById('zoning-overlayNameHidden').value).join(' <em>or</em>&nbsp;&nbsp;') : '';
                        $this.toCloud(
                            parentInput.getAttribute('id'),
                            parentInput.getAttribute('data-placeholder') ? parentInput.getAttribute('data-placeholder') + ': ' : parentInput.getAttribute('placeholder') + ': ',
                            zoningOList
                        );
                        break;
                    case 'owner':
                        $this.addToCloudCheckboxes(target, 'owner', 'owner');
                        // eslint-disable-next-line no-case-declarations
                        const ownerList = document.getElementById('ownerNameHidden').value ? JSON.parse(document.getElementById('ownerNameHidden').value).join(' <em>or</em>&nbsp;&nbsp;') : '';
                        $this.toCloud(
                            parentInput.getAttribute('id'),
                            parentInput.getAttribute('data-placeholder') ? parentInput.getAttribute('data-placeholder') + ': ' : parentInput.getAttribute('placeholder') + ': ',
                            ownerList
                        );
                        break;
                    case 'county':
                        $this.addToCloudSigledCheckboxes('county');
                        // eslint-disable-next-line no-case-declarations
                        const countyList = document.getElementById('countyNameHidden').value ? JSON.parse(document.getElementById('countyNameHidden').value).join('&nbsp;<em>or</em>&nbsp;&nbsp;') : '';
                        $this.toCloud(
                            parentInput.getAttribute('id'),
                            parentInput.getAttribute('data-placeholder') ? parentInput.getAttribute('data-placeholder') + ': ' : parentInput.getAttribute('placeholder') + ': ',
                            countyList
                        );
                        break;
                    case 'city-limits':
                        $this.addToCloudSigledCheckboxes('city-limits');
                        // eslint-disable-next-line no-case-declarations
                        const jurisdictionList = document.getElementById('city-limitsNameHidden').value ? JSON.parse(document.getElementById('city-limitsNameHidden').value).join('&nbsp;<em>or</em>&nbsp;&nbsp;') : '';
                        $this.toCloud('city-limits', 'City limits: ', jurisdictionList);
                        break;
                    case 'fdf':
                        $this.addToCloudSigledCheckboxes('fdf');
                        if (!target.checked) {
                            $this.floodplainFdSearch('');
                        }
                        // eslint-disable-next-line no-case-declarations
                        const fdfList = document.getElementById('fdfNameHidden').value ? JSON.parse(document.getElementById('fdfNameHidden').value).join('&nbsp;<em>or</em>&nbsp;&nbsp;') : '';
                        $this.toCloud(
                            parentInput.getAttribute('id'),
                            parentInput.getAttribute('data-placeholder') ? parentInput.getAttribute('data-placeholder') + ': ' : parentInput.getAttribute('placeholder') + ': ',
                            fdfList
                        );
                        break;
                    case 'pstreet':
                        // eslint-disable-next-line no-case-declarations
                        const streetContainer = document.getElementById('streetList');
                        // eslint-disable-next-line no-case-declarations
                        const chkbxEl = document.getElementById(target.getAttribute('id'));
                        // eslint-disable-next-line no-case-declarations
                        const streetName = target.value.toLowerCase();
                        // eslint-disable-next-line no-case-declarations
                        const selStreetHidden = document.getElementById('pstreetIdHidden').value ? JSON.parse(document.getElementById('pstreetIdHidden').value) : [];
                        // eslint-disable-next-line no-case-declarations
                        const parentElContainerId = `${streetName.replace(/\s+/g, '')}`;
                        if (chkbxEl.checked) {
                            const divContainer = document.createElement('div');
                            divContainer.setAttribute('class', 'w3-row street-checked');
                            divContainer.setAttribute('id', parentElContainerId);

                            const divBtnContainer = document.createElement('div');
                            divBtnContainer.setAttribute('class', 'street w3-third');
                            divBtnContainer.innerHTML = `<i>${chkbxEl.value.toLowerCase()}</i>`;

                            const delBtn = document.createElement('span');
                            delBtn.setAttribute('class', 'del w3-opacity w3-hover-opacity-off');
                            delBtn.innerHTML = '<i class=\'fas fa-times  w3-text-white\'></i>';
                            delBtn.addEventListener('click', $this.removeAddress.bind(null, event, chkbxEl.value, parentElContainerId, $this));

                            const inptFrom = document.createElement('input');
                            inptFrom.setAttribute('name', 'houseFrom');
                            inptFrom.setAttribute('maxlength', 10);
                            inptFrom.setAttribute('type', 'text');
                            inptFrom.setAttribute('min', chkbxEl.getAttribute('data-min') ? chkbxEl.getAttribute('data-min') : '1');
                            inptFrom.setAttribute('max', chkbxEl.getAttribute('data-max') ? chkbxEl.getAttribute('data-max') : '1000');
                            inptFrom.setAttribute('class', 'w3-input w3-light-gray w3-round w3-hover-light-gray w3-border w3-border-gray w3-hover-border-theme form-control w3-padding-small');
                            inptFrom.value = chkbxEl.getAttribute('data-min') ? chkbxEl.getAttribute('data-min') : '1';
                            inptFrom.addEventListener('keyup', $this.changeHouseRange.bind(null, event, chkbxEl.value, parentElContainerId, 'houseFrom', $this));

                            const inptTo = document.createElement('input');
                            inptTo.setAttribute('name', 'houseTo');
                            inptTo.setAttribute('maxlength', 10);
                            inptTo.setAttribute('type', 'text');
                            inptTo.setAttribute('class', 'w3-input w3-light-gray w3-round w3-hover-light-gray w3-border w3-border-gray w3-hover-border-theme form-control w3-padding-small');
                            inptTo.setAttribute('min', chkbxEl.getAttribute('data-min') ? chkbxEl.getAttribute('data-min') : '1');
                            inptTo.setAttribute('max', chkbxEl.getAttribute('data-max') ? chkbxEl.getAttribute('data-max') : '1000');
                            inptTo.value = chkbxEl.getAttribute('data-max') ? chkbxEl.getAttribute('data-max') : '1000';
                            inptTo.addEventListener('keyup', $this.changeHouseRange.bind(null, event, chkbxEl.value, parentElContainerId, 'houseTo', $this));

                            const inptParentDiv = document.createElement('div');
                            inptParentDiv.setAttribute('class', 'w3-twothird w3-padding-small street-range');
                            inptParentDiv.innerHTML = '<i class=\'fas fa-home  w3-opacity w3-hover-opacity-off w3-text-black\'></i>';
                            inptParentDiv.appendChild(inptFrom);
                            inptParentDiv.appendChild(inptTo);
                            const fromError = document.createElement('span');
                            fromError.setAttribute('class', 'error-house-from');
                            const toError = document.createElement('span');
                            toError.setAttribute('class', 'error-house-to');

                            divBtnContainer.appendChild(delBtn);
                            divContainer.appendChild(divBtnContainer);
                            divContainer.appendChild(inptParentDiv);
                            const divInputError = document.createElement('div');
                            divInputError.setAttribute('class', 'w3-row error-row w3-hide');
                            divInputError.appendChild(fromError);
                            divInputError.appendChild(toError);
                            divContainer.appendChild(divInputError);
                            streetContainer.appendChild(divContainer);

                            const streetObj =
                                {
                                    street_name: chkbxEl.value,
                                    id: chkbxEl.getAttribute('data-id'),
                                    min: chkbxEl.getAttribute('data-min'),
                                    max: chkbxEl.getAttribute('data-max')
                                };
                            selStreetHidden.push(streetObj);
                            if (selStreetHidden.length <= 4) {
                                document.getElementById('streetList').style.height = `${45 * selStreetHidden.length}px`;
                            } else {
                                document.getElementById('streetList').style.height = 'auto';
                            }
                        } else {
                            const indx = selStreetHidden.findIndex(fkey => fkey.street_name === chkbxEl.value);
                            if (indx >= 0) {
                                // eslint-disable-next-line no-unused-vars
                                const dEl = document.getElementById(parentElContainerId).remove();
                                selStreetHidden.splice(indx, 1);
                            }
                            if (selStreetHidden.length < 4) {
                                document.getElementById('streetList').style.height = `${55 * selStreetHidden.length}px`;
                            } else {
                                document.getElementById('streetList').style.height = 'auto';
                            }
                            streetSearch(document.getElementById('pstreet').value);
                        }
                        document.getElementById('pstreetIdHidden').value = JSON.stringify(selStreetHidden);
                        $this.prepareAddressses();
                        break;
                    case 'affHousing':
                        if (document.getElementById('ah1').checked) {
                            document.getElementById('total_units').value = '';
                            document.getElementById('total_affordable_units').value = '';
                            document.getElementById('total_unitsHidden').value = '';
                            document.getElementById('total_affordable_unitsHidden').value = '';
                            const cloudAffTotal = document.getElementById('cloud-affordableT');
                            if (cloudAffTotal) {
                                cloudAffTotal.remove();
                            }
                            const cloudAffLow = document.getElementById('cloud-affordableL');
                            if (cloudAffLow) {
                                cloudAffLow.remove();
                            }
                        }
                        break;
                    default:
                        break;
                    }
                });
            });
        }
    }

    toCloud (catId, cat, text, poly) {
        const cloud = document.getElementById('filter-cloud');
        const cloudContainer = cloud.closest('.filter-cloud');
        const cloudItem = document.createElement('span');
        const cloudItemCategory = document.createElement('span');
        const cloudItemContent = document.createElement('span');
        const closeSign = document.createElement('i');
        cloudItem.classList.add('cloud-item', 'w3-round', 'w3-sand',
            'w3-border', 'w3-border-gray', 'w3-hover-border-theme');
        cloudItemCategory.classList.add('cloud-item-category');
        cloudItemContent.classList.add('cloud-item-content');
        closeSign.classList.add('fas', 'fa-times', 'w3-text-grey',
            'cloud-item-close');
        cloudItem.append(closeSign);
        document.getElementById('filter-cloud').style.display = 'block';
        document.getElementsByClassName('filter-cloud')[0].style.display = 'block';

        // REMOVE CLOUD
        closeSign.addEventListener('click', function (e) {
            const cloudItem = e.target.closest('.cloud-item');
            // uncheck all checkboxes if exist
            if (document.getElementById(catId)) {
                if (document.getElementById(catId).parentNode) {
                    if (document.getElementById(catId).parentNode.querySelector('.input-search-options')) {
                        const cloudCkbx = document.getElementById(catId).parentNode.querySelector('.input-search-options').querySelectorAll('input[type="checkbox"]');
                        if (cloudCkbx) {
                            cloudCkbx.forEach(box => {
                                box.checked = false;
                            });
                        }
                    }
                }
            }
            switch (catId) {
            case 'pstreet':
                document.getElementById('streetList').innerHTML = '';
                document.getElementById('pstreetIdHidden').value = '';
                break;
            case 'floodplain':
                document.getElementById('fl100').checked = false;
                document.getElementById('fl500').checked = false;
                document.getElementById('floodplain').checked = false;
                break;
            case 'opportunity':
                document.getElementById('opportunity').checked = false;
                document.getElementById('opportunityIn').checked = false;
                document.getElementById('opportunityOut').checked = false;
                break;
            case 'affordable':
                document.getElementById('ah1').checked = false;
                document.getElementById('total_units').value = '';
                document.getElementById('total_affordable_units').value = '';
                document.getElementById('total_unitsHidden').value = '';
                document.getElementById('total_affordable_unitsHidden').value = '';
                document.getElementById('affordableIn').checked = false;
                document.getElementById('affordableOut').checked = false;
                // eslint-disable-next-line no-case-declarations
                const cloudAffTotal = document.getElementById('cloud-affordableT');
                if (cloudAffTotal) {
                    cloudAffTotal.remove();
                }
                // eslint-disable-next-line no-case-declarations
                const cloudAffLow = document.getElementById('cloud-affordableL');
                if (cloudAffLow) {
                    cloudAffLow.remove();
                }
                break;
            case 'affordableT':
                document.getElementById('total_affordable_unitsHidden').value = '';
                break;
            case 'affordableL':
                document.getElementById('total_affordable_unitsHidden').value = '';
                break;
            default:
                if (document.getElementById(`${catId}IdHidden`)) {
                    document.getElementById(`${catId}IdHidden`).value = '';
                }
                if (document.getElementById(`${catId}NameHidden`)) {
                    document.getElementById(`${catId}NameHidden`).value = '';
                }
                break;
            }
            cloudItem.remove();

            if (!cloud.querySelector('span')) {
                document.getElementById('filter-cloud').style.display = 'none';
                document.getElementsByClassName('filter-cloud')[0].style.display = 'none';
                document.getElementById('filterClear').classList.add('disabled-clear');
            } else {
                document.getElementById('filter-cloud').style.display = 'block';
                document.getElementsByClassName('filter-cloud')[0].style.display = 'block';
                document.getElementById('filterClear').classList.remove('disabled-clear');
            }
            generateCriteria(document.getElementById('filter-select').value);
        });

        const jumpToSource = function (catId) {
            let ancCatID;
            if (document.getElementById(catId)) {
                const ancCat = document.getElementById(catId).closest('.filter-section');
                ancCatID = ancCat.getAttribute('id').slice(7);
            } else {
                ancCatID = catId;
            }
            document.getElementById('filter-select').value = ancCatID;
            const event = new Event('change');
            document.getElementById('filter-select').dispatchEvent(event);
        };

        if (text) {
            cloudContainer.style.display = 'block';
            if (document.getElementById(`cloud-${catId}`)) {
                document.getElementById(`cloud-${catId}`).querySelector('.cloud-item-content').innerHTML = text;
            } else {
                // add new cloud
                cloudItem.setAttribute('id', 'cloud-' + catId);
                cloudItemCategory.innerHTML = cat;
                cloudItemContent.insertAdjacentHTML('afterbegin', text);
                cloudItem.append(cloudItemCategory);
                cloudItem.append(cloudItemContent);
                cloud.append(cloudItem);

                // jump to change after click on text or category name (if text unavailable)
                cloudItemContent.addEventListener('click', () => {
                    jumpToSource(catId);
                });

                // for multi cloud data
                if (text === ' ' || poly != null) {
                    if (poly != null) {
                        catId = catId.substring(0, catId.lastIndexOf('-'));
                        cloudItem.classList.add('cloud-item-poly');
                    }

                    cloudItemCategory.addEventListener('click', () => {
                        jumpToSource(catId);
                    });
                }
            }
            document.getElementById('filterClear').classList.remove('disabled-clear');
        } else {
            // remove cloud-item if empty
            if (document.getElementById(`cloud-${catId}`)) {
                document.getElementById(`cloud-${catId}`).remove();
            }
            if (!cloud.querySelector('span')) {
                cloudContainer.style.display = 'none';
                document.getElementById('filterClear').classList.add('disabled-clear');
            }
        }
    }

    addToCloud () {
        const inputNotInInptSearch = [
            'opportunityIn',
            'opportunityOut',
            'opportunity',
            'op2',
            'fl100',
            'fl500',
            'floodplain',
            'Zipcode',
            'ah1',
            'affordableIn',
            'affordableOut',
            'affhamount',
            'total_units',
            'total_affordable_units'
        ];

        inputNotInInptSearch.forEach(elId => {
            if (document.getElementById(elId)) {
                document.getElementById(elId).addEventListener('change', (evt) => {
                    const name = evt.target.getAttribute('name');
                    let str;
                    switch (name) {
                        case 'opportunityVal':
                            // eslint-disable-next-line no-case-declarations
                            const text = evt.target.value === 'opIn' ? '&nbsp;Inside' : '&nbsp;Outside';
                            this.toCloud('opportunity', 'Opportunity zones: ', '');
                            this.toCloud('opportunity', 'Opportunity zones: ', text);
                            break;
                        case 'opportunity':
                            if (!evt.target.checked) {
                                document.getElementById('opportunityIn').checked = false;
                                document.getElementById('opportunityOut').checked = false;
                            }
                            this.toCloud('opportunity', 'Floodplain: ', '');
                            break;
                        case 'floodplain':
                            // eslint-disable-next-line no-case-declarations
                            const ftext = evt.target.checked ? ' Not in Fema Floodplain' : '';
                            if (evt.target.checked) {
                                document.getElementById('fl100').checked = false;
                                document.getElementById('fl500').checked = false;
                            }
                            this.toCloud('floodplain', 'Floodplain: ', '');
                            this.toCloud('floodplain', 'Floodplain: ', ftext);
                            break;
                        case 'flood':
                            // eslint-disable-next-line no-case-declarations
                            let fytext = '';
                            // eslint-disable-next-line no-case-declarations
                            const f100 = document.getElementById('fl100').checked;
                            // eslint-disable-next-line no-case-declarations
                            const f500 = document.getElementById('fl500').checked;
                            if (f100 && f500) {
                                fytext = ' Inside 100 and/or 500 years';
                            } else if (f100 && !f500) {
                                fytext = ' Inside 100 years';
                            } else if (!f100 && f500) {
                                fytext = ' Inside 500 years';
                            }
                            this.toCloud('floodplain', 'Floodplain: ', '');
                            this.toCloud('floodplain', 'Floodplain: ', fytext);
                            break;
                        case 'affordableVal':
                            if (evt.target.value === 'affordableIn') {
                                const textA = evt.target.checked ? ' Yes ' : '';
                                this.toCloud('affordable', 'Affordable housing: ', '');
                                this.toCloud('affordable', 'Affordable housing: ', textA);
                            } else {
                                document.getElementById('total_units').value = '';
                                document.getElementById('total_affordable_units').value = '';
                                document.getElementById('total_unitsHidden').value = '';
                                document.getElementById('total_affordable_unitsHidden').value = '';
                                const cloudAffTotal = document.getElementById('cloud-affordableT');
                                if (cloudAffTotal) {
                                    cloudAffTotal.remove();
                                }
                                const cloudAffLow = document.getElementById('cloud-affordableL');
                                if (cloudAffLow) {
                                    cloudAffLow.remove();
                                }
                                const cloud = document.getElementById('filter-cloud');

                                if (!cloud.querySelector('span')) {
                                    document.getElementById('filter-cloud').style.display = 'none';
                                    document.getElementsByClassName('filter-cloud')[0].style.display = 'none';
                                }

                                const textA = evt.target.checked ? ' No ' : '';
                                this.toCloud('affordable', 'Affordable housing: ', '');
                                this.toCloud('affordable', 'Affordable housing: ', textA);
                            }
                            break;
                        case 'affHousing':
                            if (!evt.target.checked) {
                                document.getElementById('total_units').value = '';
                                document.getElementById('total_affordable_units').value = '';
                                document.getElementById('total_unitsHidden').value = '';
                                document.getElementById('total_affordable_unitsHidden').value = '';
                                document.getElementById('affordableIn').checked = false;
                                document.getElementById('affordableOut').value = false;
                                const cloudAffTotal = document.getElementById('cloud-affordableT');
                                if (cloudAffTotal) {
                                    cloudAffTotal.remove();
                                }
                                const cloudAffLow = document.getElementById('cloud-affordableL');
                                if (cloudAffLow) {
                                    cloudAffLow.remove();
                                }
                                const cloud = document.getElementById('filter-cloud');

                                if (!cloud.querySelector('span')) {
                                    document.getElementById('filter-cloud').style.display = 'none';
                                    document.getElementsByClassName('filter-cloud')[0].style.display = 'none';
                                }
                            }
                            break;
                        case 'affhamount':
                            str = evt.target.value.replace(/,\s*$/, '');
                            this.toCloud('affordable', 'Affordable housing: ', '');
                            this.toCloud('affordable', 'Affordable housing: ', str.replace(/,/g, ' or '));
                            break;
                        case 'total_units':
                            str = evt.target.value.replace(/,\s*$/, '');
                            this.toCloud('affordableT', 'Affordable housing (unit totals): ', '');
                            this.toCloud('affordableT', 'Affordable housing (unit totals): ', str.replace(/,/g, ' or '));
                            document.getElementById('total_unitsHidden').value = str;
                            document.getElementById('total_units').value = '';
                            break;
                        case 'total_affordable_units':
                            str = evt.target.value.replace(/,\s*$/, '');
                            this.toCloud('affordableL', 'Affordable housing (low in come totals): ', '');
                            this.toCloud('affordableL', 'Affordable housing (low in come totals): ', str.replace(/,/g, ' or '));
                            document.getElementById('total_affordable_unitsHidden').value = str;
                            document.getElementById('total_affordable_units').value = '';
                            break;
                    }
                });
            }
        });
    }

    addToCloudMulti () {
        const $this = this;

        const filterBtns = document.getElementById('Filter').querySelectorAll('.connected-button');
        Array.prototype.map.call(filterBtns, function (el) {
            el.onmouseenter = function () {
                this.previousElementSibling.classList.add('hover');
            };
            el.onmouseleave = function () {
                this.previousElementSibling.classList.remove('hover');
            };

            el.onclick = function (e) {
                const currentButton = e.target;
                const field = currentButton.previousElementSibling;
                    const datepickers = field.querySelectorAll('.selected-date-range');
                    const cloudId = currentButton.getAttribute('data-cloud');
                    const selects = field.querySelectorAll('select');
                    let counter = currentButton.getAttribute('data-counter');
                    const connector = '<span class="cloud-item-connector"><br/></span>';

                let text = '';
                const addText = (array, isSelected, catId, cat, val, i) => {
                    text += isSelected ? '' : `<span id="cloud-${catId.slice(7)}"><em>${cat}</em><span>${val}</span></span>`;
                    text += (!isSelected && i < array.length) ? connector : '';
                };

                const objs = {};
                let i = 0;

                Array.prototype.map.call(datepickers, function (el) {
                    const catId = el.closest('.filter-dt').getAttribute('id');
                        const val = el.value;
                        const elId = el.getAttribute('id');
                        const cat = el.closest('.filter-dt').innerText.trim() + ': ';
                        const isSelected = val === '';

                    const strInterval = val.split(' -- ');

                    if (val) {
                        objs[`${elId}_from`] = strInterval[0];
                        objs[`${elId}_to`] = strInterval[1];
                    } else {
                        objs[`${elId}_from`] = objs[`${elId}_to`] = '';
                    }

                    addText(datepickers, isSelected, catId, cat, val, i);
                    i++;
                    el.value = '';
                    el.parentNode.classList.add('disabled');
                });

                Array.prototype.map.call(selects, function (el) {
                    const catId = el.parentNode.parentNode.previousElementSibling.getAttribute('id');
                        const cat = el.parentNode.parentNode.previousElementSibling.innerText.trim() + ': ';
                        const val = el.options[el.selectedIndex].text;
                        const isSelected = val === 'Not selected';
                    objs[el.getAttribute('id')] = el.value ? el.value : '';

                    addText(selects, isSelected, catId, cat, val, i);
                    el.value = '';
                    el.customSelect.value = '';
                });

                if (text !== '') {
                    let id;
                    let elExist = false;

                    if (Object.keys(objs).length > 0) {
                        const elHidden = document.getElementById(`${document.getElementById('filter-select').value}IdHidden`);
                        const objsHidden = elHidden.value ? JSON.parse(elHidden.value) : [];
                        objsHidden.forEach(values => {
                            const tmpObj = {};
                            // eslint-disable-next-line array-callback-return
                            Object.keys(values).map(function (key, index) {
                                if (key !== 'index') {
                                    tmpObj[key] = values[key];
                                }
                            });
                            if (JSON.stringify(tmpObj) === JSON.stringify(objs)) {
                                elExist = true;
                            }
                        });
                    }
                    if (id == null) {
                        counter++;
                        currentButton.setAttribute('data-counter', counter);
                        id = `${cloudId}`;
                    }

                    if (!elExist && Object.keys(objs).length > 0) {
                        objs.index = id;
                        const elHidden = document.getElementById(`${document.getElementById('filter-select').value}IdHidden`);
                        const objsHidden = elHidden.value ? JSON.parse(elHidden.value) : [];
                        objsHidden.push(objs);
                        elHidden.value = JSON.stringify(objsHidden);
                    }

                    if (Object.keys(objs).length > 0 && !elExist) {
                        const sel = document.getElementById('filter-select');
                        if (!document.getElementById(`cloud-${id}`)) {
                            $this.toCloud(id, `${sel.options[sel.selectedIndex].text}:&nbsp;`, text);
                        } else {
                            const cloudExistContent = document.getElementById(`cloud-${id}`).querySelector('span.cloud-item-content');
                            cloudExistContent.insertAdjacentHTML('beforeend', ` <span class="cloud-item-connector-or">or</span> ${text}`);
                        }
                    } else if (Object.keys(objs).length > 0 && elExist) {
                        message.error('Filter values exist');
                    } else {
                        message.error('You have not selected any option');
                    }
                } else {
                    message.error('You have not selected any option');
                }
            };
        });
    }

    initLiveInputs () {
        // Show - hide behaviour
        const liveInputArr = document.querySelectorAll('.input-search');
        Array.prototype.map.call(liveInputArr, function (el) {
            // with options shown after typing first letters
            el.addEventListener('keyup', (evt) => {
                const currentInput = evt.target;
                if (!currentInput.classList.contains('all-visible')) {
                    const options = currentInput.nextElementSibling;
                    if (options) {
                        options.classList.add('show');
                        currentInput.classList.add('active');
                    }
                }
            });

            // with options shown at once
            el.addEventListener('focus', (evt) => {
                const currentInput = evt.target;

                if (currentInput.classList.contains('all-visible')) {
                    const options = currentInput.nextElementSibling;

                    if (options) {
                        options.classList.add('show');
                        currentInput.classList.add('active');
                    }
                }
            });
        });

        document.addEventListener('mouseup', evt => {
            const options = document.querySelectorAll('.input-search-options');
            Array.prototype.map.call(options, function (el) {
                const div = el.parentElement;
                const parentInput = el.previousElementSibling;
                if (!el.contains(evt.target) && !div.contains(evt.target)) {
                    // Clicked in box
                    el.classList.remove('show');
                    parentInput.classList.remove('active');

                    if (!parentInput.classList.contains('all-visible')) {
                        parentInput.value = '';
                    }
                    const pickerLists = document.querySelectorAll('.calendar-dropdown');
                    Array.prototype.map.call(pickerLists, function (list) {
                        list.classList.add('w3-hide');
                    });
                }
            });
        });
    }
}

export default new Filter();
