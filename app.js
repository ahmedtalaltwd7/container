import { addRecord, addRecords, deleteRecord, getAllRecords, updateRecord } from './db.js';

const FIELDS = [
	{ key: 'containerNumber', label: 'رقم الحاوية', type: 'text' },
	{ key: 'declarationNumber', label: 'رقم البيان', type: 'text' },
	{ key: 'billOfLadingNumber', label: 'رقم البوليصة', type: 'text' },
	{ key: 'declarationDate', label: 'تاريخ البيان', type: 'date' },
	{ key: 'loadingDate', label: 'تاريخ التحميل', type: 'date' },
	{ key: 'origin', label: 'الوجهة من', type: 'text' },
	{ key: 'destination', label: 'الوجهة إلى', type: 'text' },
	{ key: 'company', label: 'اسم الشركة', type: 'text' },
	{ key: 'driverName', label: 'اسم السائق', type: 'text' },
	{ key: 'vehiclePlateNumber', label: 'رقم اللوحة', type: 'text' },
	{ key: 'unloadingDate', label: 'تاريخ التنزيل', type: 'date' }
];
const FIELD_KEYS = FIELDS.map((field) => field.key);
const FIELD_LABELS = FIELDS.map((field) => field.label);

const form = document.querySelector('#record-form');
const formMessage = document.querySelector('#form-message');
const appMessage = document.querySelector('#app-message');
const recordsContainer = document.querySelector('#records-container');
const navRecordCount = document.querySelector('#nav-record-count');
let records = [];
let editingId = null;
let saving = false;
let appMessageTimer;

function showMessage(element, message, kind = 'success') {
	element.textContent = message;
	element.className = element === formMessage ? `form-message ${kind}` : `app-message ${kind}`;
	element.hidden = false;
	if (element === appMessage) {
		clearTimeout(appMessageTimer);
		appMessageTimer = setTimeout(() => { element.hidden = true; }, 5000);
	}
}

function hideFormMessage() {
	formMessage.hidden = true;
	formMessage.textContent = '';
}

function toArabicNumber(value) {
	return new Intl.NumberFormat('ar').format(value);
}

function onlyRecordFields(source) {
	return Object.fromEntries(FIELD_KEYS.map((key) => [key, String(source[key] ?? '').trim()]));
}

function validateRecord(record) {
	for (const field of FIELDS) {
		if (!record[field.key]) return `يرجى إدخال ${field.label}.`;
	}
	for (const field of FIELDS.filter((item) => item.type === 'date')) {
		if (!isValidDate(record[field.key])) return `يرجى إدخال تاريخ صحيح في حقل ${field.label}.`;
	}
	return '';
}

function isValidDate(value) {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
	const [year, month, day] = value.split('-').map(Number);
	const date = new Date(0);
	date.setUTCFullYear(year, month - 1, day);
	return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

async function refreshRecords() {
	records = await getAllRecords();
	renderDashboard();
	renderRecords();
	navRecordCount.textContent = toArabicNumber(records.length);
}

function renderDashboard() {
	document.querySelector('#total-records').textContent = toArabicNumber(records.length);
	const uniqueContainers = new Set(records.map((record) => record.containerNumber.trim()).filter(Boolean));
	document.querySelector('#container-count').textContent = toArabicNumber(uniqueContainers.size);
	const container = document.querySelector('#recent-records');
	container.replaceChildren();
	if (!records.length) {
		container.append(createEmptyState('لا توجد سجلات بعد', 'أضف أول سجل شحنة ليظهر هنا.'));
		return;
	}
	const latest = [...records].sort((a, b) => Number(b.id) - Number(a.id)).slice(0, 4);
	for (const record of latest) {
		const item = document.createElement('article');
		item.className = 'recent-item';
		const icon = document.createElement('span');
		icon.className = 'recent-icon';
		icon.textContent = '▣';
		const info = document.createElement('div');
		info.className = 'recent-info';
		const title = document.createElement('strong');
		title.textContent = record.containerNumber;
		const subtitle = document.createElement('span');
		subtitle.textContent = `${record.origin} ← ${record.destination}`;
		info.append(title, subtitle);
		const date = document.createElement('time');
		date.textContent = formatDate(record.declarationDate);
		item.append(icon, info, date);
		item.addEventListener('click', () => openRecord(record.id));
		item.setAttribute('role', 'button');
		item.setAttribute('tabindex', '0');
		item.addEventListener('keydown', (event) => {
			if (event.key === 'Enter' || event.key === ' ') openRecord(record.id);
		});
		container.append(item);
	}
}

function createEmptyState(title, description) {
	const empty = document.createElement('div');
	empty.className = 'empty-state';
	const icon = document.createElement('span');
	icon.className = 'empty-icon';
	icon.textContent = '⌕';
	const heading = document.createElement('strong');
	heading.textContent = title;
	const text = document.createElement('p');
	text.textContent = description;
	empty.append(icon, heading, text);
	return empty;
}

function formatDate(value) {
	if (!isValidDate(value)) return '—';
	const [year, month, day] = value.split('-').map(Number);
	const date = new Date(0);
	date.setUTCFullYear(year, month - 1, day);
	return new Intl.DateTimeFormat('ar', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(date);
}

function appendRecordFields(parent, record) {
	const list = document.createElement('dl');
	list.className = 'record-fields';
	for (const field of FIELDS) {
		const item = document.createElement('div');
		item.className = 'record-field';
		const term = document.createElement('dt');
		term.textContent = field.label;
		const value = document.createElement('dd');
		value.textContent = field.type === 'date' ? formatDate(record[field.key]) : record[field.key];
		item.append(term, value);
		list.append(item);
	}
	parent.append(list);
}

function createActionButton(label, className, action, id) {
	const button = document.createElement('button');
	button.type = 'button';
	button.className = className;
	button.textContent = label;
	button.addEventListener('click', () => action(id));
	return button;
}

function renderRecords() {
	const filtered = getFilteredRecords();
	document.querySelector('#results-count').textContent = `عرض ${toArabicNumber(filtered.length)} من ${toArabicNumber(records.length)} سجل`;
	document.querySelector('#export-filtered-csv').disabled = filtered.length === 0;
	document.querySelector('#export-all-records-csv').disabled = records.length === 0;
	recordsContainer.replaceChildren();
	if (!filtered.length) {
		recordsContainer.append(createEmptyState(records.length ? 'لا توجد نتائج مطابقة' : 'لا توجد سجلات محفوظة', records.length ? 'جرّب تغيير كلمات البحث أو الفلاتر.' : 'ابدأ بإضافة سجل شحنة جديد.'));
		return;
	}

	const tableWrap = document.createElement('div');
	tableWrap.className = 'table-wrap panel';
	const table = document.createElement('table');
	table.className = 'records-table';
	const thead = document.createElement('thead');
	const headerRow = document.createElement('tr');
	for (const field of FIELDS) {
		const th = document.createElement('th');
		th.scope = 'col';
		th.textContent = field.label;
		headerRow.append(th);
	}
	const actionHead = document.createElement('th');
	actionHead.scope = 'col';
	actionHead.textContent = 'الإجراءات';
	headerRow.append(actionHead);
	thead.append(headerRow);
	const tbody = document.createElement('tbody');
	for (const record of filtered) {
		const row = document.createElement('tr');
		for (const field of FIELDS) {
			const cell = document.createElement('td');
			cell.textContent = field.type === 'date' ? formatDate(record[field.key]) : record[field.key];
			row.append(cell);
		}
		const actions = document.createElement('td');
		actions.className = 'table-actions';
		actions.append(
			createActionButton('تنزيل CSV', 'action-button download-action', downloadSingleRecord, record.id),
			createActionButton('تعديل', 'action-button edit-action', openRecord, record.id),
			createActionButton('حذف', 'action-button delete-action', removeRecord, record.id)
		);
		row.append(actions);
		tbody.append(row);
	}
	table.append(thead, tbody);
	tableWrap.append(table);
	const cards = document.createElement('div');
	cards.className = 'record-cards';
	for (const record of filtered) {
		const card = document.createElement('article');
		card.className = 'record-card panel';
		const heading = document.createElement('div');
		heading.className = 'record-card-heading';
		const titleArea = document.createElement('div');
		const label = document.createElement('span');
		label.className = 'card-overline';
		label.textContent = 'رقم الحاوية';
		const title = document.createElement('h2');
		title.textContent = record.containerNumber;
		titleArea.append(label, title);
		const badge = document.createElement('span');
		badge.className = 'record-badge';
		badge.textContent = formatDate(record.declarationDate);
		heading.append(titleArea, badge);
		appendRecordFields(card, record);
		const actions = document.createElement('div');
		actions.className = 'card-actions';
		actions.append(
			createActionButton('تنزيل CSV', 'button button-download', downloadSingleRecord, record.id),
			createActionButton('تعديل السجل', 'button button-secondary', openRecord, record.id),
			createActionButton('حذف', 'button button-danger', removeRecord, record.id)
		);
		card.prepend(heading);
		card.append(actions);
		cards.append(card);
	}
	recordsContainer.append(tableWrap, cards);
}

function getFilteredRecords() {
	const searchTerm = document.querySelector('#search-input').value.trim().toLocaleLowerCase('ar');
	const dateFilters = {
		declarationDate: document.querySelector('#filter-declaration-date').value,
		loadingDate: document.querySelector('#filter-loading-date').value,
		unloadingDate: document.querySelector('#filter-unloading-date').value
	};
	const sortOrder = document.querySelector('#sort-order').value;
	return records.filter((record) => {
		const searchable = [
			record.containerNumber, record.declarationNumber, record.billOfLadingNumber,
			record.origin, record.destination, record.company, record.driverName, record.vehiclePlateNumber
		].join(' ').toLocaleLowerCase('ar');
		return (!searchTerm || searchable.includes(searchTerm)) &&
			Object.entries(dateFilters).every(([key, value]) => !value || record[key] === value);
	}).sort((a, b) => {
		const dateOrder = a.declarationDate.localeCompare(b.declarationDate);
		const fallbackOrder = Number(a.id) - Number(b.id);
		return sortOrder === 'oldest' ? dateOrder || fallbackOrder : -(dateOrder || fallbackOrder);
	});
}

function setView(viewName) {
	for (const section of document.querySelectorAll('.view-section')) section.hidden = section.id !== `${viewName}-view`;
	for (const button of document.querySelectorAll('[data-view]')) {
		button.classList.toggle('active', button.dataset.view === viewName);
	}
	hideFormMessage();
	if (viewName === 'records') renderRecords();
	if (viewName === 'form') {
		const firstField = form.querySelector('input');
		firstField?.focus({ preventScroll: true });
	}
	document.querySelector('#main-content').scrollTo({ top: 0, behavior: 'smooth' });
}

function resetForm() {
	form.reset();
	editingId = null;
	document.querySelector('#form-title').textContent = 'إضافة سجل جديد';
	document.querySelector('#save-button').textContent = 'حفظ السجل';
	hideFormMessage();
}

function openRecord(id) {
	const record = records.find((item) => item.id === id);
	if (!record) {
		showMessage(appMessage, 'تعذر العثور على السجل المطلوب.', 'error');
		return;
	}
	editingId = id;
	for (const field of FIELDS) form.elements.namedItem(field.key).value = record[field.key];
	document.querySelector('#form-title').textContent = 'تعديل سجل الشحنة';
	document.querySelector('#save-button').textContent = 'حفظ التعديلات';
	setView('form');
}

async function removeRecord(id) {
	const record = records.find((item) => item.id === id);
	if (!record || !window.confirm(`هل أنت متأكد من حذف سجل الحاوية ${record.containerNumber}؟ لا يمكن التراجع عن هذا الإجراء.`)) return;
	try {
		await deleteRecord(id);
		await refreshRecords();
		showMessage(appMessage, 'تم حذف السجل بنجاح.');
	} catch (error) {
		showMessage(appMessage, `تعذر حذف السجل: ${error.message}`, 'error');
	}
}

form.addEventListener('submit', async (event) => {
	event.preventDefault();
	if (saving) return;
	const record = onlyRecordFields(Object.fromEntries(new FormData(form)));
	const validationMessage = validateRecord(record);
	if (validationMessage) {
		showMessage(formMessage, validationMessage, 'error');
		form.elements.namedItem(FIELD_KEYS.find((key) => !record[key]) || 'declarationDate').focus();
		return;
	}
	saving = true;
	const saveButton = document.querySelector('#save-button');
	saveButton.disabled = true;
	const wasEditing = editingId !== null;
	try {
		if (editingId === null) await addRecord(record);
		else await updateRecord(editingId, record);
		await refreshRecords();
		resetForm();
		showMessage(appMessage, wasEditing ? 'تم تحديث السجل بنجاح.' : 'تم حفظ السجل بنجاح.');
		setView('dashboard');
	} catch (error) {
		showMessage(formMessage, `تعذر حفظ السجل: ${error.message}`, 'error');
	} finally {
		saving = false;
		saveButton.disabled = false;
	}
});

document.querySelector('#clear-button').addEventListener('click', resetForm);
for (const button of document.querySelectorAll('[data-view]')) {
	button.addEventListener('click', () => {
		if (button.dataset.view === 'form' && editingId === null) resetForm();
		setView(button.dataset.view);
	});
}
for (const selector of ['#search-input', '#filter-declaration-date', '#filter-loading-date', '#filter-unloading-date', '#sort-order']) {
	document.querySelector(selector).addEventListener('input', renderRecords);
	document.querySelector(selector).addEventListener('change', renderRecords);
}
document.querySelector('#clear-filters').addEventListener('click', () => {
	document.querySelector('#search-input').value = '';
	document.querySelector('#filter-declaration-date').value = '';
	document.querySelector('#filter-loading-date').value = '';
	document.querySelector('#filter-unloading-date').value = '';
	document.querySelector('#sort-order').value = 'newest';
	renderRecords();
});

function csvEscape(value) {
	const text = String(value ?? '');
	return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function downloadFile(filename, content, type) {
	const url = URL.createObjectURL(new Blob([content], { type }));
	const link = document.createElement('a');
	link.href = url;
	link.download = filename;
	link.click();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportRecordsCsv(recordsToExport, filename, message) {
	const lines = [FIELD_LABELS, ...recordsToExport.map((record) => FIELD_KEYS.map((key) => record[key]))]
		.map((row) => row.map(csvEscape).join(','));
	downloadFile(filename, `\uFEFF${lines.join('\r\n')}`, 'text/csv;charset=utf-8');
	showMessage(appMessage, message);
}

function exportCsv() {
	exportRecordsCsv(records, 'سجلات-الشحنات.csv', `تم تصدير ${toArabicNumber(records.length)} سجل إلى CSV.`);
}

function downloadSingleRecord(id) {
	const record = records.find((item) => item.id === id);
	if (!record) {
		showMessage(appMessage, 'تعذر العثور على السجل المطلوب لتنزيله.', 'error');
		return;
	}
	const safeContainerNumber = record.containerNumber.replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-');
	exportRecordsCsv([record], `سجل-${safeContainerNumber}.csv`, 'تم تنزيل السجل المحدد بصيغة CSV.');
}

function parseCsv(text) {
	const rows = [];
	let row = [];
	let value = '';
	let quoted = false;
	const source = text.replace(/^\uFEFF/, '');
	for (let index = 0; index < source.length; index += 1) {
		const character = source[index];
		if (quoted) {
			if (character === '"' && source[index + 1] === '"') {
				value += '"';
				index += 1;
			} else if (character === '"') quoted = false;
			else value += character;
		} else if (character === '"' && value === '') quoted = true;
		else if (character === ',') {
			row.push(value);
			value = '';
		} else if (character === '\n' || character === '\r') {
			if (character === '\r' && source[index + 1] === '\n') index += 1;
			row.push(value);
			if (row.some((cell) => cell !== '') || row.length > 1) rows.push(row);
			row = [];
			value = '';
		} else value += character;
	}
	if (quoted) throw new Error('ملف CSV غير صالح: توجد علامة اقتباس غير مكتملة.');
	if (value !== '' || row.length) {
		row.push(value);
		if (row.some((cell) => cell !== '') || row.length > 1) rows.push(row);
	}
	return rows;
}

const FIELD_ALIASES = new Map(FIELDS.flatMap((field) => [
	[field.label, field.key],
	[field.key, field.key],
	[{
		containerNumber: 'Container Number',
		declarationNumber: 'Declaration Number',
		billOfLadingNumber: 'Bill of Lading Number',
		declarationDate: 'Declaration Date',
		loadingDate: 'Loading Date',
		origin: 'Origin',
		destination: 'Destination',
		driverName: 'Driver Name',
		vehiclePlateNumber: 'Vehicle Plate Number',
		unloadingDate: 'Unloading Date'
	}[field.key], field.key]
]));

async function recordsFromCsv(file) {
	const rows = parseCsv(await file.text());
	if (!rows.length) throw new Error('الملف فارغ ولا يحتوي على عناوين الحقول.');
	const headers = rows[0].map((header) => FIELD_ALIASES.get(header.trim()));
	if (headers.length !== FIELDS.length || headers.some((key) => !key) || new Set(headers).size !== FIELDS.length) {
		throw new Error('يجب أن يحتوي ملف CSV على الحقول العشرة المطلوبة فقط، بعناوين الملف المُصدّر.');
	}
	return rows.slice(1).map((cells, index) => {
		if (cells.length !== FIELDS.length) throw new Error(`عدد القيم غير صحيح في الصف ${toArabicNumber(index + 2)}.`);
		const record = onlyRecordFields(Object.fromEntries(headers.map((key, column) => [key, cells[column]])));
		const error = validateRecord(record);
		if (error) throw new Error(`الصف ${toArabicNumber(index + 2)}: ${error}`);
		return record;
	});
}

function validateBackup(value) {
	if (!Array.isArray(value)) throw new Error('يجب أن تحتوي نسخة JSON على قائمة سجلات.');
	return value.map((item, index) => {
		if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error(`السجل ${toArabicNumber(index + 1)} غير صالح.`);
		const keys = Object.keys(item);
		if (keys.length !== FIELD_KEYS.length || FIELD_KEYS.some((key) => !Object.hasOwn(item, key))) {
			throw new Error(`يجب أن يحتوي السجل ${toArabicNumber(index + 1)} على الحقول العشرة المحددة فقط.`);
		}
		const record = onlyRecordFields(item);
		const error = validateRecord(record);
		if (error) throw new Error(`السجل ${toArabicNumber(index + 1)}: ${error}`);
		return record;
	});
}

async function importRecords(file, type) {
	if (!file) return;
	try {
		const imported = type === 'csv'
			? await recordsFromCsv(file)
			: validateBackup(JSON.parse(await file.text()));
		if (!imported.length) throw new Error('لا توجد سجلات لاستيرادها.');
		await addRecords(imported);
		await refreshRecords();
		showMessage(appMessage, `تم استيراد ${toArabicNumber(imported.length)} سجل بنجاح.`);
	} catch (error) {
		showMessage(appMessage, `تعذر استيراد الملف: ${error.message}`, 'error');
	} finally {
		document.querySelector(type === 'csv' ? '#import-csv' : '#import-json').value = '';
	}
}

document.querySelector('#export-csv').addEventListener('click', exportCsv);
document.querySelector('#export-filtered-csv').addEventListener('click', () => {
	const filtered = getFilteredRecords();
	if (!filtered.length) return;
	exportRecordsCsv(filtered, 'نتائج-البحث-والتصفية.csv', `تم تنزيل ${toArabicNumber(filtered.length)} سجل من النتائج المعروضة.`);
});
document.querySelector('#export-all-records-csv').addEventListener('click', exportCsv);
document.querySelector('#export-json').addEventListener('click', () => {
	const backup = records.map((record) => onlyRecordFields(record));
	downloadFile('نسخة-سجلات-الشحنات.json', JSON.stringify(backup, null, 2), 'application/json;charset=utf-8');
	showMessage(appMessage, `تم إنشاء نسخة احتياطية من ${toArabicNumber(records.length)} سجل.`);
});
document.querySelector('#import-csv').addEventListener('change', (event) => importRecords(event.currentTarget.files[0], 'csv'));
document.querySelector('#import-json').addEventListener('change', (event) => importRecords(event.currentTarget.files[0], 'json'));

function updateConnectionStatus() {
	const online = navigator.onLine;
	const status = document.querySelector('#connection-status');
	status.classList.toggle('is-offline', !online);
	document.querySelector('#connection-label').textContent = online ? 'متصل' : 'دون اتصال';
}
window.addEventListener('online', updateConnectionStatus);
window.addEventListener('offline', updateConnectionStatus);
updateConnectionStatus();

let installPrompt;
window.addEventListener('beforeinstallprompt', (event) => {
	event.preventDefault();
	installPrompt = event;
	document.querySelector('#install-button').hidden = false;
});
document.querySelector('#install-button').addEventListener('click', async () => {
	if (!installPrompt) return;
	await installPrompt.prompt();
	installPrompt = null;
	document.querySelector('#install-button').hidden = true;
});

if ('serviceWorker' in navigator) {
	window.addEventListener('load', () => {
		navigator.serviceWorker.register('/service-worker.js').catch((error) => {
			showMessage(appMessage, `تعذر تفعيل وضع العمل دون اتصال: ${error.message}`, 'error');
		});
	});
}

try {
	await refreshRecords();
} catch (error) {
	showMessage(appMessage, `تعذر تحميل السجلات المحلية: ${error.message}`, 'error');
}
