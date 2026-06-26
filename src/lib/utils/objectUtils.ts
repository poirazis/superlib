export function cloneDeep<T>(obj: T): T {
	if (obj == null || typeof obj !== 'object') {
		return obj;
	}
	if (Array.isArray(obj)) {
		return obj.map(cloneDeep) as any;
	}
	const cloned: any = {};
	for (const key in obj) {
		if (Object.prototype.hasOwnProperty.call(obj, key)) {
			cloned[key] = cloneDeep(obj[key]);
		}
	}
	return cloned;
}

export function deepGet(obj: any, path: string | string[], unwindArrays = false): any {
	if (!obj || !path) {
		return undefined;
	}
	const pathArray = Array.isArray(path) ? path : path.split('.');
	let current = obj;
	for (const key of pathArray) {
		if (current == null) {
			return undefined;
		}
		current = current[key];
		if (unwindArrays && Array.isArray(current)) {
			current = current[0];
		}
	}
	return current;
}

export function deepSet(obj: any, path: string | string[], value: any): void {
	if (!obj || !path) {
		return;
	}
	const pathArray = Array.isArray(path) ? path : path.split('.');
	let current = obj;
	for (let i = 0; i < pathArray.length - 1; i++) {
		const key = pathArray[i];
		if (!current[key] || typeof current[key] !== 'object') {
			current[key] = {};
		}
		current = current[key];
	}
	current[pathArray[pathArray.length - 1]] = value;
}
