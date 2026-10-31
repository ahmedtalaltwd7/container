const DATABASE_NAME = 'sijil-shipment-records';
const DATABASE_VERSION = 1;
const STORE_NAME = 'records';

let databasePromise;

function openDatabase() {
	if (!('indexedDB' in window)) {
		return Promise.reject(new Error('هذا المتصفح لا يدعم التخزين المحلي المطلوب.'));
	}

	if (!databasePromise) {
		databasePromise = new Promise((resolve, reject) => {
			const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
			request.onupgradeneeded = () => {
				const database = request.result;
				if (!database.objectStoreNames.contains(STORE_NAME)) {
					database.createObjectStore(STORE_NAME, { autoIncrement: true });
				}
			};
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => {
				databasePromise = undefined;
				reject(request.error || new Error('تعذر فتح قاعدة البيانات المحلية.'));
			};
			request.onblocked = () => reject(new Error('أغلق النسخ الأخرى من التطبيق لإكمال تحديث قاعدة البيانات.'));
		});
	}

	return databasePromise;
}

function runTransaction(mode, operation) {
	return openDatabase().then((database) => new Promise((resolve, reject) => {
		const transaction = database.transaction(STORE_NAME, mode);
		const store = transaction.objectStore(STORE_NAME);
		let result;
		try {
			result = operation(store);
		} catch (error) {
			reject(error);
			return;
		}
		transaction.oncomplete = () => resolve(result);
		transaction.onerror = () => reject(transaction.error || new Error('تعذر إكمال العملية على قاعدة البيانات.'));
		transaction.onabort = () => reject(transaction.error || new Error('تم إلغاء العملية على قاعدة البيانات.'));
	}));
}

export async function getAllRecords() {
	const database = await openDatabase();
	return new Promise((resolve, reject) => {
		const request = database.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).openCursor();
		const records = [];
		request.onsuccess = () => {
			const cursor = request.result;
			if (!cursor) {
				resolve(records);
				return;
			}
			records.push({ id: cursor.primaryKey, ...cursor.value });
			cursor.continue();
		};
		request.onerror = () => reject(request.error || new Error('تعذر قراءة السجلات المحفوظة.'));
	});
}

export function addRecord(record) {
	return runTransaction('readwrite', (store) => store.add(record));
}

export function updateRecord(id, record) {
	return runTransaction('readwrite', (store) => store.put(record, id));
}

export function deleteRecord(id) {
	return runTransaction('readwrite', (store) => store.delete(id));
}

export function deleteAllRecords() {
	return runTransaction('readwrite', (store) => store.clear());
}

export async function addRecords(records) {
	const database = await openDatabase();
	return new Promise((resolve, reject) => {
		const transaction = database.transaction(STORE_NAME, 'readwrite');
		const store = transaction.objectStore(STORE_NAME);
		for (const record of records) store.add(record);
		transaction.oncomplete = resolve;
		transaction.onerror = () => reject(transaction.error || new Error('تعذر استيراد السجلات.'));
		transaction.onabort = () => reject(transaction.error || new Error('تم إلغاء استيراد السجلات.'));
	});
}
