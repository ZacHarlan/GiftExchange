/**
 * @jest-environment jsdom
 */

const { BadSantaGame, BadSantaStore, BadSantaUI, MAX_STEALS } = require('../../bad-santa.js');

// random() just below 1 makes Fisher-Yates keep the original order: #1 = first name, etc.
const keepOrder = () => 0.999999;
const names = n => ['Ann', 'Ben', 'Cy', 'Di', 'Ed', 'Fay'].slice(0, n);

function started(n = 4) {
    const g = new BadSantaGame(names(n), keepOrder);
    g.drawOrder();
    return g;
}

const ownerName = (g, giftId) => g.player(g.gift(giftId).ownerId).name;

describe('BadSantaGame: setup and turn order', () => {
    test('needs at least 2 players', () => {
        expect(() => new BadSantaGame(['Solo'])).toThrow(/at least 2/);
        expect(() => new BadSantaGame(['', '  '])).toThrow(/at least 2/);
    });

    test('one wrapped gift per player, nothing happens before the draw', () => {
        const g = new BadSantaGame(names(3), keepOrder);
        expect(g.phase).toBe('setup');
        expect(g.unopenedCount()).toBe(3);
        expect(() => g.openGift('Socks')).toThrow(/setup/);
    });

    test('drawOrder gives every player exactly one number 1..N using the injected random', () => {
        const seq = [0.1, 0.7, 0.3, 0.5, 0.9];
        let i = 0;
        const g = new BadSantaGame(names(6), () => seq[i++ % seq.length]);
        const order = g.drawOrder();
        expect(order.map(p => p.number)).toEqual([1, 2, 3, 4, 5, 6]);
        expect(new Set(order.map(p => p.name)).size).toBe(6);
        expect(order.map(p => p.name)).not.toEqual(names(6)); // actually shuffled
        expect(g.phase).toBe('turns');
        expect(g.currentPlayer().name).toBe(order[0].name);
    });
});

describe('BadSantaGame: opening and stealing', () => {
    test('opening a gift records it, gives it to the player and passes the turn', () => {
        const g = started(3);
        const gift = g.openGift('  Bluetooth speaker ');
        expect(gift.description).toBe('Bluetooth speaker');
        expect(ownerName(g, gift.id)).toBe('Ann');
        expect(g.currentPlayer().name).toBe('Ben');
        expect(g.unopenedCount()).toBe(2);
        expect(() => g.openGift('   ')).toThrow(/what the gift is/);
    });

    test('a steal hands the turn to the victim, who opens and the turn moves on', () => {
        const g = started(3);
        const speaker = g.openGift('Speaker'); // Ann
        g.steal(speaker.id); // Ben steals from Ann
        expect(ownerName(g, speaker.id)).toBe('Ben');
        expect(g.gift(speaker.id).steals).toBe(1);
        expect(g.currentPlayer().name).toBe('Ann');
        expect(g.isChain()).toBe(true);
        expect(g.turnOwner().name).toBe('Ben');

        g.openGift('Mug'); // Ann opens, chain ends
        expect(g.isChain()).toBe(false);
        expect(g.currentPlayer().name).toBe('Cy');
    });

    test('a robbed player cannot steal back the gift just taken from them, but can steal another', () => {
        const g = started(4);
        const speaker = g.openGift('Speaker'); // Ann
        const mug = g.openGift('Mug'); // Ben
        g.steal(speaker.id); // Cy takes Speaker from Ann -> Ann's move
        expect(g.stealBlockReason(speaker.id)).toMatch(/steal back/);
        expect(() => g.steal(speaker.id)).toThrow(/steal back/);
        g.steal(mug.id); // Ann takes Mug from Ben -> Ben's move
        expect(g.currentPlayer().name).toBe('Ben');
        expect(g.stealBlockReason(mug.id)).toMatch(/steal back/);
        // Ben may take the Speaker (it was never taken from Ben this turn)
        expect(g.stealBlockReason(speaker.id)).toBe('');
    });

    test('the no-steal-back rule resets when the turn ends', () => {
        const g = started(4);
        const speaker = g.openGift('Speaker'); // Ann
        g.steal(speaker.id); // Ben takes it, Ann's move
        g.openGift('Mug'); // Ann opens; turn passes to Cy
        g.openGift('Hat'); // Cy opens; Di's turn
        g.steal(speaker.id); // Di takes Speaker from Ben -> Ben's move
        expect(g.currentPlayer().name).toBe('Ben');
        expect(g.stealBlockReason(speaker.id)).toMatch(/steal back/); // blocked for Ben now
    });

    test('a gift locks after 3 steals and shows its count', () => {
        const g = started(5);
        const speaker = g.openGift('Speaker'); // Ann
        g.steal(speaker.id); // Ben from Ann (1)
        g.openGift('Mug'); // Ann
        g.steal(speaker.id); // Cy from Ben (2)
        g.openGift('Hat'); // Ben
        g.steal(speaker.id); // Di from Cy (3)
        expect(g.gift(speaker.id).steals).toBe(MAX_STEALS);
        expect(g.isLocked(g.gift(speaker.id))).toBe(true);
        expect(g.stealBlockReason(speaker.id)).toMatch(/locked/);
        expect(() => g.steal(speaker.id)).toThrow(/locked/);
        expect(g.stealableGifts().map(x => x.description)).not.toContain('Speaker');
    });

    test('cannot steal your own, a wrapped gift, or an unknown gift', () => {
        const g = started(3);
        expect(g.stealBlockReason('g1')).toMatch(/wrapped/);
        expect(g.stealBlockReason('nope')).toMatch(/wrapped/);
        g.openGift('Speaker');
        g.steal('g1'); // Ben takes it
        g.openGift('Mug'); // Ann opens g2
        // Cy's turn: Cy owns nothing; Ben owns Speaker
        expect(g.stealBlockReason('g1')).toBe('');
    });

    test('a victim always has a wrapped gift available to open', () => {
        const g = started(2);
        const a = g.openGift('Speaker'); // Ann
        g.steal(a.id); // Ben steals; Ann must act
        expect(g.unopenedCount()).toBe(1);
        g.openGift('Mug');
        expect(g.phase).toBe('final');
    });
});

describe('BadSantaGame: final steal by #1 and results', () => {
    function playedOut() {
        const g = started(3);
        g.openGift('Speaker'); // Ann g1
        g.openGift('Mug'); // Ben g2
        g.openGift('Hat'); // Cy g3
        return g;
    }

    test('after everyone goes, #1 gets the final steal', () => {
        const g = playedOut();
        expect(g.phase).toBe('final');
        expect(g.currentPlayer().name).toBe('Ann');
        expect(g.stealableGifts().map(x => x.description).sort()).toEqual(['Hat', 'Mug']);
    });

    test('the final steal is a swap and ends the game (no chain)', () => {
        const g = playedOut();
        g.finalSteal('g3'); // Ann takes Hat from Cy, Cy gets Speaker
        expect(g.phase).toBe('done');
        expect(g.results()).toEqual([
            { number: 1, name: 'Ann', gift: 'Hat' },
            { number: 2, name: 'Ben', gift: 'Mug' },
            { number: 3, name: 'Cy', gift: 'Speaker' },
        ]);
        expect(g.gift('g3').steals).toBe(1);
        expect(g.describe(g.state.log[g.state.log.length - 1])).toMatch(/Ann used the final steal: took Hat from Cy and gave them Speaker/);
    });

    test('#1 may skip the final steal', () => {
        const g = playedOut();
        g.finalSteal(null);
        expect(g.phase).toBe('done');
        expect(g.results().map(r => r.gift)).toEqual(['Speaker', 'Mug', 'Hat']);
    });

    test('the final steal respects the 3-steal lock', () => {
        const g = started(2);
        const a = g.openGift('Speaker'); // Ann
        g.steal(a.id); // Ben (1) -> Ann
        g.openGift('Mug'); // Ann, -> final
        g.state.gifts.find(x => x.id === a.id).steals = 3; // as if stolen 3 times
        expect(g.stealableGifts()).toEqual([]);
        expect(() => g.finalSteal(a.id)).toThrow(/locked/);
        g.finalSteal(null);
        expect(g.phase).toBe('done');
    });

    test('no more moves once the game is done', () => {
        const g = playedOut();
        g.finalSteal(null);
        expect(() => g.finalSteal(null)).toThrow(/done/);
        expect(() => g.openGift('x')).toThrow(/done/);
    });
});

describe('BadSantaGame: save and resume', () => {
    test('toJSON/fromJSON round-trips a game mid-chain', () => {
        const g = started(4);
        const s = g.openGift('Speaker');
        g.openGift('Mug');
        g.steal(s.id); // Cy takes from Ann; Ann's move, can't take Speaker back

        const resumed = BadSantaGame.fromJSON(JSON.parse(JSON.stringify(g.toJSON())), keepOrder);
        expect(resumed.currentPlayer().name).toBe('Ann');
        expect(resumed.stealBlockReason(s.id)).toMatch(/steal back/);
        resumed.openGift('Hat');
        expect(resumed.currentPlayer().name).toBe('Di');
    });

    test('fromJSON rejects unknown data', () => {
        expect(() => BadSantaGame.fromJSON({ version: 2 })).toThrow(/saved game/);
        expect(() => BadSantaGame.fromJSON(null)).toThrow(/saved game/);
    });

    test('BadSantaStore saves versioned JSON and never throws', () => {
        const data = {};
        const storage = { getItem: k => data[k] ?? null, setItem: (k, v) => { data[k] = v; }, removeItem: k => { delete data[k]; } };
        const store = new BadSantaStore(storage);
        expect(store.load()).toBeNull();
        store.save({ a: 1 });
        expect(JSON.parse(data[BadSantaStore.KEY])).toEqual({ version: 1, game: { a: 1 } });
        expect(store.load()).toEqual({ a: 1 });
        store.clear();
        expect(store.load()).toBeNull();

        data[BadSantaStore.KEY] = '{broken';
        expect(store.load()).toBeNull();
        const bad = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); }, removeItem() { throw new Error('x'); } };
        const s2 = new BadSantaStore(bad);
        expect(s2.load()).toBeNull();
        expect(() => s2.save({})).not.toThrow();
        expect(() => s2.clear()).not.toThrow();
        expect(new BadSantaStore(null).load()).toBeNull();
    });
});

describe('BadSantaUI (jsdom)', () => {
    function memoryStore() {
        let saved = null;
        return { load: () => saved, save: g => { saved = g; }, clear: () => { saved = null; }, peek: () => saved };
    }

    function mount({ players = names(3), store = memoryStore(), confirm = () => true } = {}) {
        document.body.innerHTML = `
            <div id="modeSwitch"><button data-mode="secret-santa"></button><button data-mode="bad-santa"></button></div>
            <section id="badSantaSection"></section>`;
        const ui = new BadSantaUI({
            root: document.getElementById('badSantaSection'),
            modeSwitch: document.getElementById('modeSwitch'),
            store,
            getPlayers: () => players,
            confirm,
            random: keepOrder,
        });
        return { ui, store, root: document.getElementById('badSantaSection') };
    }

    const click = (root, selector) => root.querySelector(selector).click();
    const unwrap = (root, text) => {
        root.querySelector('#bsGiftInput').value = text;
        root.querySelector('form[data-action="open"]').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    };

    test('mode switch toggles body[data-mode] and the pressed state', () => {
        mount();
        expect(document.body.dataset.mode).toBe('secret-santa');
        document.querySelector('#modeSwitch [data-mode="bad-santa"]').click();
        expect(document.body.dataset.mode).toBe('bad-santa');
        expect(document.querySelector('#modeSwitch [data-mode="bad-santa"]').getAttribute('aria-pressed')).toBe('true');
    });

    test('asks for at least 2 people when the list is too short', () => {
        const { root } = mount({ players: ['Solo'] });
        expect(root.textContent).toMatch(/at least 2 people/);
        expect(root.querySelector('[data-action="draw"]')).toBeNull();
    });

    test('draw -> reveal order -> play a full game -> summary', () => {
        const { root, store } = mount();
        click(root, '[data-action="draw"]');
        expect([...root.querySelectorAll('.bs-draw-item')].map(li => li.textContent)).toEqual(['#1Ann', '#2Ben', '#3Cy']);
        click(root, '[data-action="start-turns"]');
        expect(root.querySelector('.bs-actor').textContent).toBe('#1 Ann');

        unwrap(root, 'Speaker');
        expect(root.querySelector('.bs-actor').textContent).toBe('#2 Ben');
        click(root, '[data-action="steal"][data-gift="g1"]'); // Ben steals Speaker
        expect(root.querySelector('.bs-actor').textContent).toBe('#1 Ann');
        expect(root.querySelector('.bs-robbed')).not.toBeNull();
        const back = root.querySelector('[data-action="steal"][data-gift="g1"]');
        expect(back.disabled).toBe(true);
        expect(back.title).toMatch(/steal back/);
        expect(root.querySelector('.bs-steals').textContent).toBe('Stolen 1/3');

        unwrap(root, 'Mug'); // Ann
        unwrap(root, 'Hat'); // Cy
        expect(root.querySelector('.bs-turn-label').textContent).toBe('Final steal');
        click(root, '[data-action="final-steal"][data-gift="g3"]'); // Ann swaps Mug for Hat
        const results = [...root.querySelectorAll('.bs-result')].map(li => li.textContent);
        expect(results).toEqual(['#1Ann→Hat', '#2Ben→Speaker', '#3Cy→Mug']);
        expect(store.peek().phase).toBe('done');
    });

    test('gift names are rendered as text, never HTML', () => {
        const { root } = mount();
        click(root, '[data-action="draw"]');
        click(root, '[data-action="start-turns"]');
        unwrap(root, '<img src=x onerror="window.bsPwned=1">');
        expect(root.querySelector('.bs-gifts img')).toBeNull();
        expect(root.querySelector('.bs-gift-name').textContent).toContain('<img');
        expect(window.bsPwned).toBeUndefined();
    });

    test('an empty gift name shows a message instead of crashing', () => {
        const { root } = mount();
        click(root, '[data-action="draw"]');
        click(root, '[data-action="start-turns"]');
        unwrap(root, '  ');
        expect(root.querySelector('.bs-message').textContent).toMatch(/what the gift is/);
        expect(root.querySelector('.bs-actor').textContent).toBe('#1 Ann');
    });

    test('a saved game in progress resumes on load, straight into Bad Santa mode', () => {
        const store = memoryStore();
        const first = mount({ store });
        click(first.root, '[data-action="draw"]');
        click(first.root, '[data-action="start-turns"]');
        unwrap(first.root, 'Speaker');

        const { root } = mount({ store });
        expect(document.body.dataset.mode).toBe('bad-santa');
        expect(root.querySelector('.bs-actor').textContent).toBe('#2 Ben');
        expect(root.querySelector('.bs-gift-name').textContent).toBe('Speaker');
    });

    test('New game asks first and clears the saved game', () => {
        const store = memoryStore();
        let answer = false;
        const { root } = mount({ store, confirm: () => answer });
        click(root, '[data-action="draw"]');
        click(root, '[data-action="start-turns"]');
        click(root, '[data-action="new-game"]');
        expect(root.querySelector('.bs-actor')).not.toBeNull(); // declined
        answer = true;
        click(root, '[data-action="new-game"]');
        expect(root.querySelector('[data-action="draw"]')).not.toBeNull();
        expect(store.peek()).toBeNull();
    });
});
