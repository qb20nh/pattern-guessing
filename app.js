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
    getRelativeCenterPos(el, container) {
        const { top, left, width, height } = el.getBoundingClinetRect();
        const { top: cTop, left: cLeft } = container.getBoundingClientRect();

        const relTop = cTop - top;
        const relLeft = cLeft - left;
        return { left: relLeft + width * 0.5, top: relTop + height * 0.5 };
    },
    readonly(obj) {
        return new Proxy(obj, {
            defineProperty() {
                return false;
            },
            deleteProperty() {
                return false;
            },
            set() {
                return false;
            },
            setPrototypeOf() {
                return false;
            }
        });
    },
	createListener() {
		const _listeners = new Set();
		return {
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
				_listeners.forEach((fn) => {
					this.removeListener(fn);
				})
			},
		};
	},
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
    const listeners = new Set();
	let _currentState = initialState;
    return util.readonly({
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
    mousePos: [],
    tiles: [],
	get tilesToRender() {
		return this.tiles;
	},
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

// Listener to render the contiguous line segments
pointerState.addListener((prev, next, data) => {
    const lineHTML = ([c1, r1], [c2, r2]) => {
        return `<div class="line" data-point="(${c1},${r1})->(${c2},${r2})"></div>`
	};
    const lines = data.tiles
        .map((_, i, a) => [a[i], a[i + 1]])
        .slice(0, -1)
        .map((e) => lineHTML(...e));
	console.log(lines);
});

document.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    const el = e.target;
    if (el.matches(".col")) {
        const col = util.getIndexOf(el);
        const row = util.getIndexOf(el.parentNode);
        pointerState.change(T.press, [col, row]);
    }
});

document.addEventListener("pointermove", (e) => {
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (pointerState.currentState === S.down && el.matches(".col")) {
        const col = util.getIndexOf(el);
        const row = util.getIndexOf(el.parentNode);
        pointerState.change(T.intersect, [col, row]);
    }
});

document.addEventListener("pointerup", (e) => {
    if (pointerState.currentState === S.down) {
        pointerState.change(T.release);
    }
});
