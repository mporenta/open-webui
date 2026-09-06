(() => {
	const REASONING_EFFORTS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];
	const SELECT_MARKER = 'data-pi-reasoning-effort-select';
	const NATIVE_SELECTOR = 'input[aria-label="Reasoning Effort"]';
	const MODEL_SELECTOR = '#model-selector-model-button';
	const VOICE_SELECTOR = '#voice-input-button';

	let activeInput = null;
	let toolbarSelect = null;
	let lastRoute = '';
	let lastToolbar = null;
	let reconcileQueued = false;
	let stateSyncing = false;

	function waitFor(getValue, timeout = 2000) {
		const immediate = getValue();
		if (immediate) return Promise.resolve(immediate);

		return new Promise((resolve) => {
			const observer = new MutationObserver(() => {
				const value = getValue();
				if (!value) return;
				observer.disconnect();
				clearTimeout(timer);
				resolve(value);
			});
			const timer = setTimeout(() => {
				observer.disconnect();
				resolve(null);
			}, timeout);
			observer.observe(document.body, { childList: true, subtree: true });
		});
	}

	function findReasoningRow() {
		const label = Array.from(document.querySelectorAll('div')).find(
			(element) => element.childElementCount === 0 && element.textContent?.trim() === 'Reasoning Effort'
		);
		return label?.parentElement ?? null;
	}

	function setInputValue(input, value) {
		const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
		setter?.call(input, value);
		input.dispatchEvent(new Event('input', { bubbles: true }));
		input.dispatchEvent(new Event('change', { bubbles: true }));
	}

	function setToolbarValue(value) {
		if (!toolbarSelect) return;

		toolbarSelect.querySelector('option[data-unsupported]')?.remove();
		if (value && !REASONING_EFFORTS.includes(value)) {
			const option = document.createElement('option');
			option.dataset.unsupported = 'true';
			option.value = value;
			option.textContent = `Effort · ${value}`;
			toolbarSelect.prepend(option);
		}
		toolbarSelect.value = value ?? '';
	}

	function connectNativeInput(input) {
		activeInput = input;
		input.hidden = true;
		input.dataset.piControlEnhanced = 'true';

		if (input.dataset.piToolbarBound !== 'true') {
			input.dataset.piToolbarBound = 'true';
			input.addEventListener('input', () => setToolbarValue(input.value));
		}

		setToolbarValue(input.value);
	}

	function createToolbarSelect() {
		const select = document.createElement('select');
		select.setAttribute(SELECT_MARKER, '');
		select.setAttribute('aria-label', 'Reasoning Effort');
		select.title = 'Reasoning Effort';
		select.className = [
			'max-w-[7.5rem] cursor-pointer rounded-lg bg-transparent py-1 pl-1.5 pr-6 text-[0.8125rem] font-normal',
			'text-gray-600 outline-hidden transition-colors hover:bg-gray-50/40 hover:text-gray-700',
			'dark:text-gray-300 dark:hover:bg-gray-800/40 dark:hover:text-gray-200'
		].join(' ');

		const values = [
			['', 'Effort · Default'],
			...REASONING_EFFORTS.map((effort) => [
				effort,
				`Effort · ${effort === 'xhigh' ? 'XHigh' : effort[0].toUpperCase() + effort.slice(1)}`
			])
		];
		for (const [value, label] of values) {
			const option = document.createElement('option');
			option.value = value;
			option.textContent = label;
			select.append(option);
		}

		select.addEventListener('change', () => updateScopedState(select.value));
		return select;
	}

	function ensureToolbarSelect() {
		const modelButton = document.querySelector(MODEL_SELECTOR);
		const voiceButton = document.querySelector(VOICE_SELECTOR);
		const toolbar = modelButton?.closest('.self-end.flex.space-x-1.mr-1.min-w-0');
		const voiceContainer = voiceButton?.parentElement;
		if (!toolbar || !voiceContainer) return null;

		let select = toolbar.querySelector(`[${SELECT_MARKER}]`);
		if (!select) {
			select = createToolbarSelect();
			toolbar.insertBefore(select, voiceContainer);
		}

		toolbarSelect = select;
		return select;
	}

	async function openControlsIfNeeded() {
		if (findReasoningRow()) return false;

		const controlsButton = document.querySelector('button[aria-label="Controls"]');
		controlsButton?.click();
		await waitFor(findReasoningRow);
		return true;
	}

	function closeControls() {
		document.querySelector('button[aria-label="Close"]')?.click();
	}

	async function syncFromScopedState() {
		if (stateSyncing || !toolbarSelect) return;
		stateSyncing = true;
		const openedControls = await openControlsIfNeeded();

		try {
			const input = document.querySelector(NATIVE_SELECTOR);
			if (input) {
				connectNativeInput(input);
			} else {
				activeInput = null;
				setToolbarValue('');
			}
		} finally {
			if (openedControls) closeControls();
			stateSyncing = false;
		}
	}

	async function updateScopedState(value) {
		if (stateSyncing) return;
		stateSyncing = true;
		const openedControls = await openControlsIfNeeded();

		try {
			let input = document.querySelector(NATIVE_SELECTOR);
			const row = findReasoningRow();
			const modeButton = row?.querySelector('button');

			if (!value) {
				if (input) {
					modeButton?.click();
					await waitFor(() => !document.querySelector(NATIVE_SELECTOR));
				}
				activeInput = null;
				setToolbarValue('');
				return;
			}

			if (!input) {
				modeButton?.click();
				input = await waitFor(() => document.querySelector(NATIVE_SELECTOR));
			}
			if (!input) throw new Error('Reasoning Effort input did not mount');

			connectNativeInput(input);
			setInputValue(input, value);
			setToolbarValue(value);
		} catch (error) {
			console.error('[reasoning-effort-toolbar]', error);
			await syncFromScopedState();
		} finally {
			if (openedControls) closeControls();
			stateSyncing = false;
		}
	}

	async function reconcile() {
		reconcileQueued = false;
		const select = ensureToolbarSelect();
		if (!select) return;

		const input = document.querySelector(NATIVE_SELECTOR);
		if (input && input !== activeInput) connectNativeInput(input);

		const route = `${location.pathname}${location.search}`;
		if (select !== lastToolbar || route !== lastRoute) {
			lastToolbar = select;
			lastRoute = route;
			await syncFromScopedState();
		}
	}

	function queueReconcile() {
		if (reconcileQueued) return;
		reconcileQueued = true;
		queueMicrotask(reconcile);
	}

	const observer = new MutationObserver(queueReconcile);
	function start() {
		queueReconcile();
		observer.observe(document.body, { childList: true, subtree: true });
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', start, { once: true });
	} else {
		start();
	}
})();
