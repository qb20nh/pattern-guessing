const util = Object.freeze({
	getTagStr(el) {
		const outerOuterHTML = el.outerHTML.replace(el.innerHTML, "");
		const end = new RegExp(`</${el.tagName}>$`, "giu");
		return outerOuterHTML.replace(end, "");
	},
	getIndexOf(el) {
		return [...el.parentNode.children].indexOf(el);
	},
	enumify(typeName, [...keys]) {
		if (!typeName) throw new RangeError("Must specify type name");
		if (!keys.length) throw new TypeError("Must specify at least one item");
		if (!keys.filter(Boolean).length)
			throw new RangeError("Key must not be empty");
		if (keys.length != new Set(keys).size)
			throw new RangeError("No duplicate keys allowed");
		const map = {};
		const entries = keys.map((k) => [k, Symbol(`${typeName}.${k}`)]);
		entries.forEach(([k, v]) => {
			map[k] = v;
			map[v] = k;
		});
		return Object.freeze(map);
	},
	instantiate(fn) {
		return (...args) => new fn(...args);
	},
	getCenterPos(el) {
		const { top: cTop, left: cLeft } = container.getBoundingClientRect();
		const { top, left, width, height } = el.getBoundingClientRect();
		return { left: left + width * 0.5, top: top + height * 0.5, cLeft, cTop };
	},
	createListener() {
		const _listeners = new Set();
		return Object.freeze({
			addListener(fn) {
				fn._meta?.('added');
				_listeners.add(fn);
			},
			removeListener(fn) {
				fn._meta?.('removed');
				_listeners.delete(fn);
			},
			notify(...data) {
				_listeners.forEach((fn) => {
					fn(...data);
				});
			},
			removeAllListeners() {
				_listeners.clear();
				_listeners.forEach((fn) => {
					fn._meta?.('removed');
				})
			},
		});
	},
	filter(obj) {
		function filterByKeys([...keys], invert = false) {
			const filtered = {};
			for (const key in obj) {
				if (keys.includes(key) !== invert) {
					filtered[key] = obj[key];
				}
			}
			return filtered;
		}

		return {
			with(...keys) {
				return filterByKeys(keys);
			},
			without(...keys) {
				return filterByKeys(keys, true);
			},
		};
	},
	_equals(a, b, visited = new Map()) {
		function isTypedArray(obj) {
			return ArrayBuffer.isView(obj) && !(obj instanceof DataView);
		}
		function from(a, b) {
			return (combiner) => (test) => combiner(test(a), test(b));
		}
		function compare(...comparators) {
			return (a, b) => comparators.every(c => c(a) === c(b));
		}
		function call(Type, method) {
			return o => Type.prototype?.[method]?.call?.(o)
		}
		const BOTH = (a, b) => a && b;
		const EITHER = (a, b) => a || b;
		const length = a => a.length;
		const species = a => a[Symbol.species];
		const size = a => a.size;
		if (from(a, b)(EITHER)(o => typeof o !== "object")) {
			return Object.is(a, b);
		}
		if (from(a, b)(BOTH)(Array.isArray)) {
			return compare(species, length)(a, b)
				&& a.every((e, i) => this.equals(e, b[i]));
		}
		if (from(a, b)(BOTH)(isTypedArray)) {
			return compare(species, length)(a, b)
				&& Array.from(a).every((e, i) => this.equals(e, b[i]));
		}
		if (from(a, b)(BOTH)(o => o instanceof Date)) {
			return compare(call(Date, 'getTimezoneOffset'), call(Date, 'getTime'))(a, b);
		}
		if (from(a, b)(BOTH)(o => o instanceof RegExp)) {
			return compare(species, a => a.source)(a, b);
		}
		if (from(a, b)(BOTH)(o => o instanceof Set)) {
			return compare(species, size)(a, b)
				&& a.symmetricDifference(b).size === 0;
		}
		if (from(a, b)(BOTH)(o => o instanceof Map)) {
			let equal = compare(species, size);
			if (equal) {
				for (const [k, v] of a) {
					if (!this.equals(v, b.get(k))) {
						return false;
					}
				}
			}
			return equal;
		}
		if (from(a, b)(BOTH)(o => Object.getPrototypeOf(o) === Object.prototype)) {
			// Check if we've already visited these objects
			if (visited.get(a) === b && visited.get(b) === a) {
				return true;
			}
			// Mark these objects as visited
			visited.set(a, b);
			visited.set(b, a);

			for (const k in a) {
				if (!this.equals(a[k], b[k], visited)) {
					return false;
				}
			}
			return true;
		}
		if (from(a, b)(BOTH)(o => o instanceof Node)) {
			return a === b;
		}
		if (a === b) {
			return true;
		}
		throw new TypeError('Unsupported type(s) of objects');
	},
	equals(a, b) {
		return this._equals(a, b);
	},
	throttleWithChange(fn) {
		let prev = [];
		return function (...args) {
			if (!util.equals(prev, args)) {
				prev = args;
				return fn(...args);
			}
		};
	},
	escapeAttribute([...parts], ...values) {
		const escapeSequence = {
			"'": `&apos;`,
			'"': `&quot;`,
		};
		for (let i = 0; i < parts.length - 1; i++) {
			const opening = parts[i].at(-1);
			const closing = parts[i + 1].at(0);
			if (opening in escapeSequence && opening === closing) {
				values[i] = values[i].replace(new RegExp(`${opening}`, "g"), escapeSequence[opening]);
			}
		}
		return parts.slice(1).reduce((arr, part) => {
			return arr.concat(values.shift(), part);
		}, [parts[0]]).join('');
	},
	createProperty(name, initialValue, { onGet, onSet, assignTarget }) {
		let value = initialValue;
		const _get = () => {
			onGet?.(name, value);
			return value;
		};
		const _set = (newValue) => {
			onSet?.(name, value, newValue);
			value = newValue;
		};
		if (assignTarget) {
			const propertyDefinition = {
				get() {
					return _get();
				},
				set(newValue) {
					_set(newValue);
				},
			};
			Object.defineProperty(assignTarget, name, propertyDefinition);
		} else {
			return {
				get [name]() {
					return _get();
				},
				set [name](newValue) {
					_set(newValue);
				},
			};
		}
	},
	deferredReference(builder) {
		const status = { built: false };
		try {
			const root = {};
			const obj = builder(root);
			Object.assign(root, obj);
			return root;
		} finally {
			status.built = true;
			Object.freeze(status);
		}
	},
	transformObject(obj, { kT, vT }) {
		const tK = Object.keys(obj).map(kT);
		const tV = Object.values(obj).map(vT);
		return Object.fromEntries(tK.map((k, i) => [k, tV[i]]));
	},
	styleFromProps(map) {
		return Object.entries(this.transformObject(map, {
			kT: (k) => `--${k}`,
			vT: (v) => `${v}px`,
		}))
			.map(([k, v]) => `${k}: ${v}`)
			.join(';');
	}
});

const createStateMachine = (mapCreator, { initialState, data = {} }) => {
	class Action {
		#relatedState;
		#mutator;
		constructor(relatedState, mutator) {
			this.#relatedState = relatedState;
			this.#mutator = mutator;
		}
		get relatedState() {
			return this.#relatedState;
		}
		get mutator() {
			return this.#mutator;
		}
	}
	const map = mapCreator(data, util.instantiate(Action));
	initialState ??= Reflect.ownKeys(map)[0];
	let _currentState = initialState;
	return Object.freeze({
		get currentState() {
			return _currentState;
		},
		change(T, newData) {
			if (T in map[this.currentState]) {
				const prev = this.currentState;
				const next = map[this.currentState][T];
				if (next instanceof Action) {
					next.mutator(newData);
					_currentState = next.relatedState;
				} else {
					_currentState = next;
				}
				this.notify(prev, this.currentState, data);
			} else {
				throw new RangeError(
					`Could not find valid transition ${T} from current state ${this.currentState}`
				);
			}
		},
		...util.createListener(),
	});
};

const S = util.enumify("STATE", ["up", "down"]);
const T = util.enumify("TRANSITIONS", ["press", "release", "intersect"]);
const gameData = {
	tiles: [],
	...util.createListener(),
	push([c, r]) {
		if (!this.tiles.some(([_c, _r]) => _c === c && _r == r)) {
			this.tiles.push([c, r]);
		}
	},
	commit() {
		this.notify([...this.tiles]);
		this.tiles = [];
	}
};
const pointerState = createStateMachine(
	(data, action) => ({
		[S.up]: {
			[T.press]: action(S.down, (newData) => data.push(newData))
		},
		[S.down]: {
			[T.release]: action(S.up, (newData) => data.commit()),
			[T.intersect]: action(S.down, (newData) => data.push(newData))
		}
	}),
	{ data: gameData }
);

const linesObj = util.deferredReference((root) => ({
	...util.createListener(),
	...util.createProperty('completed', [], { onSet: () => root.notifyAll(), assignTarget: root }),
	...util.createProperty('incomplete', '', { onSet: () => root.notifyAll(), assignTarget: root }),
	notifyAll() {
		root.notify({ completed: root.completed, incomplete: root.incomplete });
	},
}));

// Listener to render the contiguous line segments
pointerState.addListener((prev, next, data) => {
	const lineHTML = ([c1, r1], [c2, r2]) => {
		return util.escapeAttribute`<div class="line" data-point="${`(${c1},${r1})->(${c2},${r2})`}"></div>`;
	};
	const linesHTML = data.tiles
		.map((_, i, a) => [a[i], a[i + 1]])
		.slice(0, -1)
		.map((e) => lineHTML(...e));

	linesObj.completed = linesHTML;
});

linesObj.addListener(({ completed, incomplete }) => {
	lines.innerHTML = completed.concat(incomplete).join('');
});

document.addEventListener("pointerdown", (e) => {
	e.preventDefault();
	const el = e.target;
	if (pointerState.currentState === S.up && el.matches(".col")) {
		const col = util.getIndexOf(el);
		const row = util.getIndexOf(el.parentNode);
		pointerState.change(T.press, [col, row]);
	}
});

const onIntersect = util.throttleWithChange((el) => {
	const col = util.getIndexOf(el);
	const row = util.getIndexOf(el.parentNode);
	pointerState.change(T.intersect, [col, row]);
});


document.addEventListener("pointermove", ({ clientX, clientY }) => {
	const el = document.elementFromPoint(clientX, clientY);
	if (pointerState.currentState === S.down) {
		if (linesObj.completed.length < 9) {
			const [c, r] = gameData.tiles.at(-1);
			const last = container.children[r].children[c];
			if (last) {
				const { left, top, cLeft, cTop } = util.getCenterPos(last);
				const styleProps = {
					x2: left - cLeft,
					y2: top - cTop,
					x1: clientX - cLeft,
					y1: clientY - cTop,
				};
				const incomplete = util.escapeAttribute`<div class="line" style="${util.styleFromProps(styleProps)}"></div>`;
				linesObj.incomplete = incomplete;
			}
		} else {
			linesObj.incomplete = '';
		}
		if (el.matches(".col")) {
			onIntersect(el);
		}
	}
});

document.addEventListener("pointerup", (e) => {
	if (pointerState.currentState === S.down) {
		linesObj.incomplete = '';
		pointerState.change(T.release);
	}
});
