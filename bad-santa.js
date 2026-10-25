/**
 * Bad Santa (white elephant) game.
 *
 * Rules:
 *  - Every player draws a number; that's the turn order. There is one wrapped gift per player.
 *  - On a turn, the player opens a new gift from the pile (and says what it is) or steals any
 *    unwrapped gift that isn't locked.
 *  - Someone who is stolen from goes right away (open or steal), but can't take back a gift
 *    that was taken from them during the same turn.
 *  - A gift can be stolen at most 3 times; after that it's locked.
 *  - After everyone has gone, player #1 may make one final steal. It's a swap (the other
 *    player gets #1's gift) and doesn't start a chain. Then the game ends.
 *
 * BadSantaGame is pure (no DOM, no storage). BadSantaStore persists it. BadSantaUI renders it.
 */

const MAX_STEALS = 3;
const defaultRandom = () => Math.random();

// --- Engine ---

class BadSantaGame {
    constructor(playerNames, random) {
        const names = (Array.isArray(playerNames) ? playerNames : [])
            .map(n => String(n || '').trim())
            .filter(Boolean);
        if (names.length < 2) throw new Error('Bad Santa needs at least 2 players.');
        this.random = typeof random === 'function' ? random : defaultRandom;
        this.state = {
            version: 1,
            phase: 'setup', // setup -> turns -> final -> done
            players: names.map((name, i) => ({ id: `p${i}`, name })),
            order: [],
            turnIndex: 0,
            activePlayerId: null,
            takenThisTurn: {}, // playerId -> giftIds taken from them during the current turn
            gifts: names.map((_, i) => ({ id: `g${i + 1}`, description: null, ownerId: null, steals: 0 })),
            log: []
        };
    }

    static get MAX_STEALS() {
        return MAX_STEALS;
    }

    // Each player draws a number (Fisher-Yates with the injected random source).
    drawOrder() {
        this.assertPhase('setup');
        const ids = this.state.players.map(p => p.id);
        for (let i = ids.length - 1; i > 0; i--) {
            const j = Math.floor(this.random() * (i + 1));
            [ids[i], ids[j]] = [ids[j], ids[i]];
        }
        this.state.order = ids;
        this.state.phase = 'turns';
        this.state.turnIndex = 0;
        this.state.activePlayerId = ids[0];
        this.state.takenThisTurn = {};
        return this.orderedPlayers();
    }

    get phase() {
        return this.state.phase;
    }

    player(id) {
        return this.state.players.find(p => p.id === id) || null;
    }

    gift(id) {
        return this.state.gifts.find(g => g.id === id) || null;
    }

    orderedPlayers() {
        return this.state.order.map((id, i) => ({ number: i + 1, ...this.player(id) }));
    }

    numberOf(playerId) {
        return this.state.order.indexOf(playerId) + 1;
    }

    currentPlayer() {
        if (this.state.phase === 'final') return this.player(this.state.order[0]);
        if (this.state.phase !== 'turns') return null;
        return this.player(this.state.activePlayerId);
    }

    // The player whose numbered turn it is (differs from currentPlayer during a steal chain).
    turnOwner() {
        if (this.state.phase !== 'turns') return null;
        return this.player(this.state.order[this.state.turnIndex]);
    }

    isChain() {
        const owner = this.turnOwner();
        return !!owner && owner.id !== this.state.activePlayerId;
    }

    giftOf(playerId) {
        return this.state.gifts.find(g => g.ownerId === playerId) || null;
    }

    unopenedCount() {
        return this.state.gifts.filter(g => g.description === null).length;
    }

    openedGifts() {
        return this.state.gifts.filter(g => g.description !== null);
    }

    isLocked(gift) {
        return gift.steals >= MAX_STEALS;
    }

    // Why the current player can't steal this gift, or '' if they can.
    stealBlockReason(giftId) {
        const gift = this.gift(giftId);
        const actor = this.currentPlayer();
        if (!gift || gift.description === null) return 'That gift is still wrapped.';
        if (!actor) return 'The game is not in progress.';
        if (gift.ownerId === actor.id) return 'That is already your gift.';
        if (this.isLocked(gift)) return `That gift has been stolen ${MAX_STEALS} times and is locked.`;
        if (this.state.phase === 'turns') {
            const taken = this.state.takenThisTurn[actor.id] || [];
            if (taken.includes(giftId)) return 'You can’t steal back a gift that was just taken from you.';
        }
        return '';
    }

    stealableGifts() {
        return this.openedGifts().filter(g => !this.stealBlockReason(g.id));
    }

    openGift(description) {
        this.assertPhase('turns');
        const text = String(description || '').trim();
        if (!text) throw new Error('Say what the gift is before revealing it.');
        const gift = this.state.gifts.find(g => g.description === null);
        if (!gift) throw new Error('There are no wrapped gifts left.');
        const actor = this.currentPlayer();
        gift.description = text;
        gift.ownerId = actor.id;
        this.addLog('open', { playerId: actor.id, giftId: gift.id });
        this.endTurn();
        return gift;
    }

    steal(giftId) {
        this.assertPhase('turns');
        const reason = this.stealBlockReason(giftId);
        if (reason) throw new Error(reason);
        const gift = this.gift(giftId);
        const thief = this.currentPlayer();
        const victimId = gift.ownerId;
        gift.ownerId = thief.id;
        gift.steals += 1;
        const taken = this.state.takenThisTurn[victimId] || [];
        this.state.takenThisTurn[victimId] = [...taken, gift.id];
        this.state.activePlayerId = victimId; // the victim goes next, right away
        this.addLog('steal', { playerId: thief.id, victimId, giftId: gift.id, steals: gift.steals });
        return gift;
    }

    // Player #1's optional last move. Pass null to keep their gift.
    finalSteal(giftId) {
        this.assertPhase('final');
        const first = this.currentPlayer();
        if (giftId === null || giftId === undefined) {
            this.addLog('keep', { playerId: first.id });
            this.state.phase = 'done';
            return null;
        }
        const reason = this.stealBlockReason(giftId);
        if (reason) throw new Error(reason);
        const target = this.gift(giftId);
        const victimId = target.ownerId;
        const mine = this.giftOf(first.id);
        target.ownerId = first.id;
        target.steals += 1;
        if (mine) mine.ownerId = victimId;
        this.addLog('swap', { playerId: first.id, victimId, giftId: target.id, steals: target.steals, givenGiftId: mine ? mine.id : null });
        this.state.phase = 'done';
        return target;
    }

    results() {
        return this.orderedPlayers().map(p => {
            const g = this.giftOf(p.id);
            return { number: p.number, name: p.name, gift: g ? g.description : null };
        });
    }

    endTurn() {
        this.state.takenThisTurn = {};
        this.state.turnIndex += 1;
        if (this.state.turnIndex >= this.state.order.length) {
            this.state.phase = 'final';
            this.state.activePlayerId = this.state.order[0];
        } else {
            this.state.activePlayerId = this.state.order[this.state.turnIndex];
        }
    }

    addLog(type, data) {
        this.state.log.push({ type, ...data });
    }

    // Human-readable sentence for a log entry.
    describe(entry) {
        const name = id => (this.player(id) || { name: '?' }).name;
        const what = id => (this.gift(id) || { description: '?' }).description;
        switch (entry.type) {
            case 'open': return `${name(entry.playerId)} unwrapped ${what(entry.giftId)}.`;
            case 'steal': return `${name(entry.playerId)} stole ${what(entry.giftId)} from ${name(entry.victimId)} (${entry.steals}/${MAX_STEALS}).`;
            case 'swap': return `${name(entry.playerId)} used the final steal: took ${what(entry.giftId)} from ${name(entry.victimId)}${entry.givenGiftId ? ` and gave them ${what(entry.givenGiftId)}` : ''}.`;
            case 'keep': return `${name(entry.playerId)} kept their gift. Game over!`;
            default: return '';
        }
    }

    assertPhase(phase) {
        if (this.state.phase !== phase) throw new Error(`Not allowed during the ${this.state.phase} phase.`);
    }

    toJSON() {
        return JSON.parse(JSON.stringify(this.state));
    }

    static fromJSON(json, random) {
        if (!json || json.version !== 1 || !Array.isArray(json.players) || !Array.isArray(json.gifts)) {
            throw new Error('Unrecognized saved game.');
        }
        const game = new BadSantaGame(json.players.map(p => p.name), random);
        game.state = JSON.parse(JSON.stringify(json));
        return game;
    }
}

// --- Persistence ---

// Saves the game so a refresh mid-game resumes. Storage is injected; never throws.
class BadSantaStore {
    static get KEY() {
        return 'giftExchange.badSanta';
    }

    constructor(storage) {
        this.storage = storage;
    }

    load() {
        try {
            const raw = this.storage && this.storage.getItem(BadSantaStore.KEY);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            return parsed && parsed.version === 1 && parsed.game ? parsed.game : null;
        } catch (_) {
            return null;
        }
    }

    save(gameJson) {
        try {
            if (this.storage) this.storage.setItem(BadSantaStore.KEY, JSON.stringify({ version: 1, game: gameJson }));
        } catch (_) { }
    }

    clear() {
        try {
            if (this.storage) this.storage.removeItem(BadSantaStore.KEY);
        } catch (_) { }
    }
}

// --- UI ---

function bsEl(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

function bsButton(label, action, className, data) {
    const b = bsEl('button', className || 'secondary-btn', label);
    b.type = 'button';
    b.dataset.action = action;
    for (const [k, v] of Object.entries(data || {})) b.dataset[k] = v;
    return b;
}

class BadSantaUI {
    // options: { root, modeSwitch, store, getPlayers: () => string[], confirm, random }
    constructor(options) {
        this.root = options.root;
        this.modeSwitch = options.modeSwitch || null;
        this.store = options.store;
        this.getPlayers = options.getPlayers;
        this.confirm = options.confirm || (message => window.confirm(message));
        this.random = options.random;
        this.game = null;
        this.justDrew = false;
        this.message = '';

        const saved = this.store.load();
        if (saved) {
            try {
                this.game = BadSantaGame.fromJSON(saved, this.random);
            } catch (_) {
                this.store.clear();
            }
        }

        this.root.addEventListener('click', e => this.onClick(e));
        this.root.addEventListener('submit', e => this.onSubmit(e));
        if (this.modeSwitch) this.modeSwitch.addEventListener('click', e => this.onModeClick(e));

        // Resume straight into the game after a refresh mid-game.
        const inProgress = this.game && (this.game.phase === 'turns' || this.game.phase === 'final');
        this.setMode(inProgress ? 'bad-santa' : 'secret-santa');
        this.render();
    }

    setMode(mode) {
        document.body.dataset.mode = mode;
        if (this.modeSwitch) {
            for (const btn of this.modeSwitch.querySelectorAll('button[data-mode]')) {
                const on = btn.dataset.mode === mode;
                btn.classList.toggle('active', on);
                btn.setAttribute('aria-pressed', String(on));
            }
        }
        if (mode === 'bad-santa') this.render();
    }

    onModeClick(e) {
        const btn = e.target.closest('button[data-mode]');
        if (btn) this.setMode(btn.dataset.mode);
    }

    onSubmit(e) {
        const form = e.target.closest('form[data-action="open"]');
        if (!form) return;
        e.preventDefault();
        const input = form.querySelector('input');
        this.act(() => this.game.openGift(input ? input.value : ''));
    }

    onClick(e) {
        const btn = e.target.closest('button[data-action]');
        if (!btn || btn.disabled) return;
        const action = btn.dataset.action;
        if (action === 'draw') this.startGame();
        if (action === 'steal') this.act(() => this.game.steal(btn.dataset.gift));
        if (action === 'final-steal') this.act(() => this.game.finalSteal(btn.dataset.gift));
        if (action === 'keep') this.act(() => this.game.finalSteal(null));
        if (action === 'new-game') this.newGame();
        if (action === 'start-turns') {
            this.justDrew = false;
            this.render();
        }
    }

    startGame() {
        const players = this.getPlayers();
        try {
            this.game = new BadSantaGame(players, this.random);
        } catch (err) {
            this.message = err.message;
            this.render();
            return;
        }
        this.game.drawOrder();
        this.justDrew = true;
        this.message = '';
        this.save();
        this.render();
    }

    newGame() {
        if (this.game && this.game.phase !== 'done' && !this.confirm('Start over? The current Bad Santa game will be lost.')) return;
        this.game = null;
        this.justDrew = false;
        this.message = '';
        this.store.clear();
        this.render();
    }

    act(fn) {
        try {
            fn();
            this.message = '';
        } catch (err) {
            this.message = err.message;
        }
        this.save();
        this.render();
    }

    save() {
        if (this.game) this.store.save(this.game.toJSON());
    }

    render() {
        const parts = [bsEl('h2', 'bs-title', 'Bad Santa')];
        if (!this.game || this.game.phase === 'setup') parts.push(this.renderSetup());
        else if (this.justDrew) parts.push(this.renderDraw());
        else if (this.game.phase === 'done') parts.push(this.renderDone());
        else parts.push(this.renderTurn());
        if (this.message) {
            const msg = bsEl('p', 'bs-message', this.message);
            msg.setAttribute('role', 'alert');
            parts.push(msg);
        }
        this.root.replaceChildren(...parts);
    }

    renderSetup() {
        const wrap = bsEl('div', 'bs-setup');
        const players = this.getPlayers();
        wrap.append(bsEl('p', 'bs-lede',
            'Everyone draws a number. On your turn, unwrap a gift from the pile or steal one that’s already open. Each gift can be stolen 3 times, then it’s locked. Player #1 gets one last steal at the end.'));
        if (players.length < 2) {
            wrap.append(bsEl('p', 'bs-hint', 'Add at least 2 people on the Secret Santa tab first — the same list is used here.'));
        } else {
            wrap.append(bsEl('p', 'bs-hint', `${players.length} players from your list · ${players.length} wrapped gifts in the pile.`));
            wrap.append(bsButton('🎲 Draw numbers', 'draw', 'primary-btn bs-draw-btn'));
        }
        return wrap;
    }

    renderDraw() {
        const wrap = bsEl('div', 'bs-draw');
        wrap.append(bsEl('p', 'bs-lede', 'Numbers are in! Here’s the turn order:'));
        const list = bsEl('ol', 'bs-draw-list');
        this.game.orderedPlayers().forEach((p, i) => {
            const li = bsEl('li', 'bs-draw-item');
            li.style.setProperty('--i', String(i));
            li.append(bsEl('span', 'bs-number', `#${p.number}`), bsEl('span', 'bs-name', p.name));
            list.append(li);
        });
        wrap.append(list, bsButton('Let’s play →', 'start-turns', 'primary-btn'));
        return wrap;
    }

    renderTurn() {
        const g = this.game;
        const actor = g.currentPlayer();
        const wrap = bsEl('div', 'bs-turn');

        const banner = bsEl('div', 'bs-banner');
        if (g.phase === 'final') {
            banner.append(bsEl('p', 'bs-turn-label', 'Final steal'),
                bsEl('p', 'bs-actor', `#1 ${actor.name}`),
                bsEl('p', 'bs-sub', 'Swap your gift for any unlocked gift — or keep what you have.'));
        } else {
            const total = g.state.order.length;
            banner.append(bsEl('p', 'bs-turn-label', `Turn ${g.state.turnIndex + 1} of ${total}`),
                bsEl('p', 'bs-actor', `#${g.numberOf(actor.id)} ${actor.name}`));
            if (g.isChain()) banner.append(bsEl('p', 'bs-sub bs-robbed', 'Just got robbed! Your move: unwrap a new gift or steal a different one.'));
            else banner.append(bsEl('p', 'bs-sub', 'Unwrap a gift from the pile or steal one below.'));
        }
        wrap.append(banner);

        if (g.phase === 'turns') wrap.append(this.renderPile());
        wrap.append(this.renderOpened());

        if (g.phase === 'final') wrap.append(bsButton(`Keep my gift (${(g.giftOf(actor.id) || { description: 'nothing' }).description})`, 'keep', 'secondary-btn bs-keep'));

        wrap.append(this.renderOrder(), this.renderLog(), bsButton('New game', 'new-game', 'link-btn bs-new'));
        return wrap;
    }

    renderPile() {
        const g = this.game;
        const pile = bsEl('form', 'bs-pile');
        pile.dataset.action = 'open';
        const left = g.unopenedCount();
        const stack = bsEl('div', 'bs-stack');
        stack.setAttribute('aria-label', `${left} wrapped gifts left`);
        for (let i = 0; i < Math.min(left, 8); i++) {
            const img = bsEl('img', 'bs-wrapped');
            img.src = 'assets/gift.webp';
            img.alt = '';
            img.style.setProperty('--i', String(i));
            stack.append(img);
        }
        const label = bsEl('label', 'field-label', `Unwrap a gift (${left} left) — what is it?`);
        label.htmlFor = 'bsGiftInput';
        const row = bsEl('div', 'bs-open-row');
        const input = bsEl('input');
        input.type = 'text';
        input.id = 'bsGiftInput';
        input.placeholder = 'e.g. Fuzzy socks';
        input.autocomplete = 'off';
        const go = bsEl('button', 'primary-btn bs-open-btn', '🎁 Unwrap');
        go.type = 'submit';
        row.append(input, go);
        pile.append(stack, label, row);
        return pile;
    }

    renderOpened() {
        const g = this.game;
        const section = bsEl('div', 'bs-opened');
        const opened = g.openedGifts();
        section.append(bsEl('h3', 'bs-h3', opened.length ? 'Unwrapped gifts' : 'No gifts unwrapped yet'));
        const grid = bsEl('div', 'bs-gifts');
        for (const gift of opened) {
            const card = bsEl('div', 'bs-gift');
            const locked = g.isLocked(gift);
            if (locked) card.classList.add('locked');
            const owner = g.player(gift.ownerId);
            card.append(
                bsEl('p', 'bs-gift-name', gift.description),
                bsEl('p', 'bs-gift-owner', `with ${owner ? owner.name : '—'}`),
                bsEl('p', 'bs-steals', locked ? `🔒 ${gift.steals}/${MAX_STEALS} · locked` : `Stolen ${gift.steals}/${MAX_STEALS}`)
            );
            const reason = g.stealBlockReason(gift.id);
            if (gift.ownerId !== (g.currentPlayer() || {}).id) {
                const b = bsButton(g.phase === 'final' ? 'Swap for this' : 'Steal', g.phase === 'final' ? 'final-steal' : 'steal', 'chip-btn bs-steal-btn', { gift: gift.id });
                if (reason) {
                    b.disabled = true;
                    b.title = reason;
                }
                card.append(b);
            } else {
                card.classList.add('mine');
            }
            grid.append(card);
        }
        section.append(grid);
        return section;
    }

    renderOrder() {
        const g = this.game;
        const details = bsEl('details', 'bs-order');
        details.append(bsEl('summary', '', 'Turn order & who has what'));
        const list = bsEl('ol', 'bs-order-list');
        const current = g.currentPlayer();
        for (const p of g.orderedPlayers()) {
            const li = bsEl('li', 'bs-order-item');
            if (current && p.id === current.id) li.classList.add('current');
            const gift = g.giftOf(p.id);
            li.append(bsEl('span', 'bs-number', `#${p.number}`), bsEl('span', 'bs-name', p.name),
                bsEl('span', 'bs-holding', gift ? gift.description : '—'));
            list.append(li);
        }
        details.append(list);
        return details;
    }

    renderLog() {
        const g = this.game;
        const log = bsEl('ol', 'bs-log');
        log.setAttribute('aria-live', 'polite');
        for (const entry of g.state.log.slice(-6).reverse()) log.append(bsEl('li', '', g.describe(entry)));
        return log;
    }

    renderDone() {
        const g = this.game;
        const wrap = bsEl('div', 'bs-done');
        wrap.append(bsEl('p', 'bs-lede', 'Game over! Here’s who’s taking what home:'));
        const list = bsEl('ol', 'bs-results');
        g.results().forEach((r, i) => {
            const li = bsEl('li', 'bs-result');
            li.style.setProperty('--i', String(i));
            li.append(bsEl('span', 'bs-number', `#${r.number}`), bsEl('span', 'bs-name', r.name), bsEl('span', 'bs-arrow', '→'),
                bsEl('span', 'bs-gift-final', r.gift || '—'));
            list.append(li);
        });
        wrap.append(list, this.renderLog(), bsButton('New game', 'new-game', 'primary-btn'));
        return wrap;
    }
}

// --- Wiring (browser only; script.js is loaded first) ---

if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
        const root = document.getElementById('badSantaSection');
        if (!root || typeof UIManager === 'undefined' || typeof ParticipantStore === 'undefined') return;
        const storage = UIManager.browserStorage();
        new BadSantaUI({
            root,
            modeSwitch: document.getElementById('modeSwitch'),
            store: new BadSantaStore(storage),
            getPlayers: () => new ParticipantStore(storage).load().map(r => `${r.firstName} ${r.lastName}`)
        });
    });
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { BadSantaGame, BadSantaStore, BadSantaUI, MAX_STEALS };
}
