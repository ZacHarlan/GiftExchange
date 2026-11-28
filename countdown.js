// Countdown to Christmas — the night of the Nativity, with a flip clock.
//
//   ChristmasCountdown  pure date maths (no browser APIs; held to the domain rules)
//   CountdownScene      the night: a starry sky and the Star of Bethlehem, drawn live, over a
//                       rendered snowy valley with a chapel and the stable (Mary, Joseph and
//                       the child in the manger), with the app's shared snow falling in front.
//   CountdownUI         the screen itself: flip clock, final-ten countdown, Christmas Day,
//                       open/close, full screen, keeping the display awake.
//
// Loaded after script.js, which wires it up (it shares the app's SoundService).

// --- Date maths ---

class ChristmasCountdown {
    // Where `now` stands relative to Christmas Day in the viewer's own time zone.
    // All of 25 December counts as Christmas; from the 26th the count is to next year's.
    static at(now) {
        const year = now.getFullYear();
        const isChristmas = now.getMonth() === 11 && now.getDate() === 25;
        const passed = now.getMonth() === 11 && now.getDate() > 25;
        const targetYear = passed ? year + 1 : year;
        const target = new Date(targetYear, 11, 25, 0, 0, 0, 0);
        if (isChristmas) {
            return { christmas: true, year, target, totalSeconds: 0, days: 0, hours: 0, minutes: 0, seconds: 0, sleeps: 0 };
        }
        const totalSeconds = Math.max(1, Math.ceil((target.getTime() - now.getTime()) / 1000));
        // Nights left: whole calendar days, so daylight-saving shifts cannot miscount.
        const sleeps = Math.round(
            (Date.UTC(targetYear, 11, 25) - Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000
        );
        return {
            christmas: false,
            year: targetYear,
            target,
            totalSeconds,
            days: Math.floor(totalSeconds / 86400),
            hours: Math.floor((totalSeconds % 86400) / 3600),
            minutes: Math.floor((totalSeconds % 3600) / 60),
            seconds: totalSeconds % 60,
            sleeps,
        };
    }

    // How hard it is snowing, 0 (a light fall, 30 days or more away) to 1 (Christmas Eve night
    // and Christmas Day). It rises a little every second of the last 30 days.
    static snowLevel(state) {
        if (state.christmas) return 1;
        const span = 30 * 86400;
        return 1 - Math.min(state.totalSeconds, span) / span;
    }

    // "27 sleeps to go" — the line under the clock, and the button on the main page.
    static sleepsLine(state) {
        if (state.christmas) return 'Merry Christmas!';
        if (state.sleeps <= 0) return 'Christmas is tonight';
        if (state.sleeps === 1) return 'Just 1 sleep to go — it’s Christmas Eve';
        return `${state.sleeps} sleeps to go`;
    }

    // What a screen reader hears instead of four flipping numbers.
    static spoken(state) {
        if (state.christmas) return 'It is Christmas Day';
        const part = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
        return `${part(state.days, 'day')}, ${part(state.hours, 'hour')} and ${part(state.minutes, 'minute')} until Christmas`;
    }
}

// --- The night scene ---

// Small seeded generator, so the sky is the same every time and at every size.
function countdownSeeded(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// The rendered valley (art/countdown.py -> assets/countdown-land.webp): a 16:9 picture with a
// transparent sky. `roof` and `manger` are where the stable's ridge and the manger sit in it, as
// fractions of its width and height — the script prints them; the star hangs above the roof.
const COUNTDOWN_LAND = {
    src: 'assets/countdown-land.webp',
    aspect: 16 / 9,
    roof: [0.7731, 0.5899],
    manger: [0.7879, 0.8559],
};

class CountdownScene {
    // `back` holds the sky, the star and the valley; `front` holds the falling snow.
    // `snow` is the app's shared snow renderer ({ layout, paint, setLevel }).
    constructor(back, front, snow) {
        this.back = back || null;
        this.front = front || null;
        this.b = CountdownScene.context(this.back);
        this.f = CountdownScene.context(this.front);
        this.snow = snow || null;
        this.w = 0;
        this.h = 0;
        this.glory = false;        // Christmas Day: the star at its brightest
        this.land = null;
        this.lastT = 0;
        this.onReady = null;       // called when the picture arrives, so a still scene can repaint
        if (this.b && typeof Image !== 'undefined') {
            const img = new Image();
            img.onload = () => {
                this.land = img;
                if (this.onReady) this.onReady();
            };
            img.src = COUNTDOWN_LAND.src;
        }
    }

    static context(canvas) {
        try {
            return canvas && typeof canvas.getContext === 'function' ? canvas.getContext('2d') : null;
        } catch (_) {
            return null;
        }
    }

    ready() {
        return Boolean(this.b && this.f && this.w > 0 && this.h > 0);
    }

    setGlory(on) {
        this.glory = Boolean(on);
    }

    setSnow(level) {
        if (this.snow) this.snow.setLevel(level);
    }

    // Where the valley picture is drawn: it spans the screen and stands on its bottom edge. Its
    // own sky is transparent, so on a tall screen it is kept smaller and the stable is centred,
    // leaving the top of the screen to the clock and the star.
    static place(w, h) {
        const { aspect, roof, manger } = COUNTDOWN_LAND;
        const wide = w / h >= 1.15;
        const dh = Math.max(w / aspect, h * (wide ? 1 : 0.7));    // drawn height
        const dw = dh * aspect;
        const x = Math.min(0, Math.max(w - dw, w / 2 - roof[0] * dw));
        const centred = x + roof[0] * dw;
        const y = h - dh;
        const roofY = y + roof[1] * dh;
        return {
            x, y, dw, dh,
            roof: { x: centred, y: roofY },
            manger: { x: x + manger[0] * dw, y: y + manger[1] * dh },
            // The star stands high over the stable where there is open sky beside the clock,
            // and just above the roof on a tall screen, where the clock fills the top.
            star: { x: centred, y: wide ? Math.max(h * 0.16, roofY - h * 0.37) : roofY - h * 0.11 },
        };
    }

    resize(width, height, pixelRatio) {
        if (!this.b || !this.f) return;
        const dpr = Math.min(2, Math.max(1, pixelRatio || 1));
        this.w = Math.max(1, Math.round(width));
        this.h = Math.max(1, Math.round(height));
        this.dpr = dpr;
        for (const canvas of [this.back, this.front]) {
            canvas.width = Math.round(this.w * dpr);
            canvas.height = Math.round(this.h * dpr);
        }
        this.b.setTransform(dpr, 0, 0, dpr, 0, 0);
        this.f.setTransform(dpr, 0, 0, dpr, 0, 0);
        this.layout();
    }

    layout() {
        const { w, h } = this;
        const rnd = countdownSeeded(20261225);
        this.unit = Math.min(w, h * 1.7);
        this.at = CountdownScene.place(w, h);
        if (this.snow) this.snow.layout(w, h);

        // Stars: many faint, a few bright; fewer close to the great star so it stands alone.
        this.stars = [];
        const count = Math.round(Math.min(900, (w * h) / 2400));
        for (let i = 0; i < count; i++) {
            const bright = rnd() < 0.05;
            this.stars.push({
                x: rnd() * w, y: Math.pow(rnd(), 1.25) * h * 0.74,
                r: bright ? 1.1 + rnd() * 0.8 : 0.35 + rnd() * 0.65,
                a: bright ? 0.75 + rnd() * 0.25 : 0.25 + rnd() * 0.55,
                speed: 0.5 + rnd() * 1.9, phase: rnd() * Math.PI * 2,
                tint: rnd() < 0.22 ? '#ffe7c4' : rnd() < 0.3 ? '#cfe0ff' : '#f4f7ff',
                festive: rnd() < 0.09,
            });
        }

        // The sky itself, painted once: deep blue overhead, a cold glow along the horizon, and a
        // faint band of far-off stars across it.
        const sky = document.createElement('canvas');
        sky.width = Math.round(w * this.dpr);
        sky.height = Math.round(h * this.dpr);
        const c = sky.getContext('2d');
        c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        const g = c.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, '#02040f');
        g.addColorStop(0.35, '#061029');
        g.addColorStop(0.62, '#0e1d45');
        g.addColorStop(0.8, '#1d2f63');
        g.addColorStop(1, '#27396f');
        c.fillStyle = g;
        c.fillRect(0, 0, w, h);
        c.save();
        c.translate(w * 0.38, h * 0.3);
        c.rotate(-0.42);
        c.scale(1, 0.2);
        const band = c.createRadialGradient(0, 0, 0, 0, 0, Math.max(w, h) * 0.75);
        band.addColorStop(0, 'rgba(150,175,255,0.16)');
        band.addColorStop(0.5, 'rgba(120,150,240,0.06)');
        band.addColorStop(1, 'rgba(120,150,240,0)');
        c.fillStyle = band;
        c.beginPath();
        c.arc(0, 0, Math.max(w, h) * 0.75, 0, Math.PI * 2);
        c.fill();
        c.restore();
        this.sky = sky;

        this.glow = CountdownScene.softDot(128, '255,240,205');
        this.warm = CountdownScene.softDot(96, '255,196,110');
    }

    static softDot(size, rgb) {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = size;
        const ctx = canvas.getContext('2d');
        const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
        g.addColorStop(0, `rgba(${rgb},1)`);
        g.addColorStop(0.18, `rgba(${rgb},0.55)`);
        g.addColorStop(0.5, `rgba(${rgb},0.13)`);
        g.addColorStop(1, `rgba(${rgb},0)`);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, size, size);
        return canvas;
    }

    draw(t) {
        if (!this.ready()) return;
        this.lastT = t;
        const { b, f, w, h, at } = this;
        b.globalAlpha = 1;
        b.globalCompositeOperation = 'source-over';
        b.drawImage(this.sky, 0, 0, w, h);
        this.drawStars(b, t);
        this.drawShootingStar(b, t);
        this.drawStar(b, t);
        if (this.land) {
            b.drawImage(this.land, at.x, at.y, at.dw, at.dh);
            this.drawLamplight(b, t);
        }
        f.clearRect(0, 0, w, h);
        if (this.snow) this.snow.paint(f, t);
    }

    drawStars(ctx, t) {
        const quick = this.glory ? 1.6 : 1;
        for (const s of this.stars) {
            const twinkle = 0.6 + 0.4 * Math.sin(t * s.speed * quick + s.phase);
            const lift = this.glory && s.festive ? 1.8 : 1;
            ctx.globalAlpha = Math.min(1, s.a * twinkle * lift);
            ctx.fillStyle = this.glory && s.festive ? '#ffe6a8' : s.tint;
            ctx.beginPath();
            ctx.arc(s.x, s.y, s.r * (lift > 1 ? 1.3 : 1), 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
    }

    // One quiet streak every fourteen seconds or so, somewhere different each time.
    drawShootingStar(ctx, t) {
        const period = 14;
        const n = Math.floor(t / period);
        const p = (t - n * period - 5) / 0.9;
        if (p < 0 || p > 1) return;
        const rnd = countdownSeeded(n * 7919 + 13);
        const x0 = this.w * (0.08 + rnd() * 0.5);
        const y0 = this.h * (0.05 + rnd() * 0.22);
        const len = this.unit * 0.14;
        const x = x0 + p * len * 1.6;
        const y = y0 + p * len * 0.6;
        const g = ctx.createLinearGradient(x, y, x - len * 0.5, y - len * 0.19);
        const fade = Math.sin(p * Math.PI);
        g.addColorStop(0, `rgba(255,255,255,${0.85 * fade})`);
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.strokeStyle = g;
        ctx.lineWidth = 1.4;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - len * 0.5, y - len * 0.19);
        ctx.stroke();
    }

    // The Star of Bethlehem: a white heart, a wide soft halo, long fine rays (the longest
    // reaching down towards the stable) and a faint fall of light onto its roof.
    drawStar(ctx, t) {
        const { x, y } = this.at.star;
        const roof = this.at.roof;
        const u = this.unit;
        const breathe = 1 + 0.06 * Math.sin(t * 0.9) + 0.025 * Math.sin(t * 2.3 + 1);
        const size = (this.glory ? 1.4 : 1) * breathe;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';

        // Light falling on the stable: a few overlapping shafts, so it has no hard edge.
        const reach = Math.max(1, roof.y - y);
        const foot = roof.y + reach * 0.12;
        const fall = ctx.createLinearGradient(0, y, 0, foot);
        fall.addColorStop(0, `rgba(255,238,200,${0.05 * size})`);
        fall.addColorStop(1, 'rgba(255,238,200,0)');
        ctx.fillStyle = fall;
        for (const spread of [0.03, 0.05, 0.075, 0.105]) {
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + u * spread, foot);
            ctx.lineTo(x - u * spread, foot);
            ctx.closePath();
            ctx.fill();
        }

        // Halo.
        const halo = u * 0.5 * size;
        ctx.globalAlpha = 0.5;
        ctx.drawImage(this.glow, x - halo / 2, y - halo / 2, halo, halo);
        const inner = u * 0.13 * size;
        ctx.globalAlpha = 1;
        ctx.drawImage(this.glow, x - inner / 2, y - inner / 2, inner, inner);

        // Rays: [angle, length, width]. Straight down is the longest.
        const rays = [
            [Math.PI / 2, Math.min(reach * 0.92, u * 0.42), 0.0042], [-Math.PI / 2, 0.2, 0.0036],
            [0, 0.17, 0.0032], [Math.PI, 0.17, 0.0032],
            [Math.PI / 4, 0.065, 0.0022], [3 * Math.PI / 4, 0.065, 0.0022],
            [-Math.PI / 4, 0.065, 0.0022], [-3 * Math.PI / 4, 0.065, 0.0022],
        ];
        rays.forEach(([angle, length, width], i) => {
            const len = (length > 1 ? length : length * u) * size * (1 + 0.05 * Math.sin(t * 1.3 + i * 1.7));
            const half = width * u * size;
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(angle);
            const g = ctx.createLinearGradient(0, 0, len, 0);
            g.addColorStop(0, 'rgba(255,250,235,0.95)');
            g.addColorStop(0.25, 'rgba(255,240,205,0.45)');
            g.addColorStop(1, 'rgba(255,236,196,0)');
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.moveTo(0, -half);
            ctx.lineTo(len, 0);
            ctx.lineTo(0, half);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        });

        // The heart of the star.
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(x, y, u * 0.0052 * size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    // The lantern in the stable breathes very slightly, like a real flame.
    drawLamplight(ctx, t) {
        const { x, y } = this.at.manger;
        const flicker = 0.5 + 0.5 * Math.sin(t * 2.1) * Math.sin(t * 0.83 + 1.2);
        const size = this.at.dw * 0.16;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.05 + 0.06 * flicker + (this.glory ? 0.06 : 0);
        ctx.drawImage(this.warm, x - size / 2, y - size * 0.62, size, size);
        ctx.restore();
    }
}

// --- The screen ---

class CountdownUI {
    // options: root (the #countdownScreen element), openers (buttons that open it and show the
    // "N sleeps" teaser), sound ({ play(name) }), snow (the app's SnowField for this screen),
    // now (() => Date), onOpen (called when opened), onSnowLevel (told how hard it is snowing,
    // so the page behind can match), view (window; injected in tests).
    constructor(options) {
        this.root = options.root;
        this.openers = options.openers || [];
        this.sound = options.sound || null;
        this.now = options.now || (() => new Date());
        this.onOpen = options.onOpen || (() => { });
        this.onSnowLevel = options.onSnowLevel || (() => { });
        this.view = options.view || (typeof window !== 'undefined' ? window : null);
        this.state = null;
        this.lastKey = '';
        this.timer = null;
        this.frame = null;
        this.idleTimer = null;
        this.wakeLock = null;
        this.returnFocus = null;
        this.flipTurn = 0;

        const find = id => this.root.querySelector(`#${id}`);
        this.clock = find('countdownClock');
        this.big = find('countdownBig');
        this.title = find('countdownTitle');
        this.sleeps = find('countdownSleeps');
        this.date = find('countdownDate');
        this.closeBtn = find('countdownClose');
        this.fullBtn = find('countdownFullscreen');
        this.verse = find('countdownVerse');
        this.scene = new CountdownScene(find('countdownSky'), find('countdownSnow'), options.snow || null);
        this.scene.onReady = () => { if (this.isOpen() && this.stillScene()) this.scene.draw(30); };

        this.units = {};
        this.buildClock();

        this.openers.forEach(btn => btn.addEventListener('click', () => this.open()));
        if (this.closeBtn) this.closeBtn.addEventListener('click', () => this.close());
        if (this.fullBtn) this.fullBtn.addEventListener('click', () => this.toggleFullscreen());
        this.root.addEventListener('keydown', e => {
            if (e.key === 'Escape') this.close();
            if (e.key === 'f' || e.key === 'F') this.toggleFullscreen();
        });
        ['pointermove', 'pointerdown', 'keydown'].forEach(type => this.root.addEventListener(type, () => this.wake()));
        if (this.view) {
            this.view.addEventListener('resize', () => this.fit());
            this.view.addEventListener('hashchange', () => this.followHash());
        }

        this.updateTeaser();
        if (this.view) this.view.setInterval(() => this.updateTeaser(), 60000);
        this.followHash();
    }

    // The real clock — or, for a link ending in #countdown=finale, a preview clock that starts
    // 20 seconds before Christmas so the final countdown and Christmas Day can be seen any day.
    static clockFor(hash, realNow = () => new Date()) {
        if (!/^#countdown=finale\b/.test(String(hash || ''))) return realNow;
        const started = realNow();
        const offset = ChristmasCountdown.at(started).target.getTime() - 20000 - started.getTime();
        return () => new Date(realNow().getTime() + offset);
    }

    // A link ending in #countdown opens straight onto this screen (handy for a TV).
    followHash() {
        const hash = this.view && this.view.location ? this.view.location.hash : '';
        if (/^#countdown\b/.test(hash) && !this.isOpen()) this.open();
    }

    buildClock() {
        if (!this.clock) return;
        const make = (tag, className, text) => {
            const node = document.createElement(tag);
            node.className = className;
            if (text !== undefined) node.textContent = text;
            return node;
        };
        this.clock.replaceChildren();
        for (const [unit, label] of [['days', 'days'], ['hours', 'hours'], ['minutes', 'minutes'], ['seconds', 'seconds']]) {
            const box = make('div', 'cd-unit');
            box.dataset.unit = unit;
            const digits = make('div', 'cd-digits');
            box.append(digits, make('span', 'cd-label', label));
            this.clock.append(box);
            this.units[unit] = { digits, label: box.lastChild, cards: [] };
        }
        this.makeCard = () => {
            const card = make('span', 'cd-card');
            card.append(
                make('span', 'cd-half cd-top'), make('span', 'cd-half cd-bottom'),
                make('span', 'cd-half cd-flap-top'), make('span', 'cd-half cd-flap-bottom')
            );
            return card;
        };
    }

    isOpen() {
        return !this.root.classList.contains('hidden');
    }

    open() {
        if (this.isOpen()) return;
        this.returnFocus = document.activeElement;
        this.root.classList.remove('hidden');
        document.body.classList.add('countdown-open');
        this.setHash(true);
        this.lastKey = '';
        this.tick(true);
        this.fit();
        if (this.view) {
            this.timer = this.view.setInterval(() => this.tick(false), 200);
            this.startScene();
        }
        this.keepAwake(true);
        this.wake();
        if (this.closeBtn) this.closeBtn.focus();
        if (this.sound) this.sound.play('chime');
        this.onOpen();
    }

    close() {
        if (!this.isOpen()) return;
        this.root.classList.add('hidden');
        document.body.classList.remove('countdown-open');
        this.setHash(false);
        if (this.view) {
            this.view.clearInterval(this.timer);
            this.view.clearTimeout(this.idleTimer);
            if (this.frame !== null && this.view.cancelAnimationFrame) this.view.cancelAnimationFrame(this.frame);
        }
        this.timer = null;
        this.frame = null;
        this.keepAwake(false);
        if (document.fullscreenElement && document.exitFullscreen) {
            Promise.resolve(document.exitFullscreen()).catch(() => { });
        }
        if (this.returnFocus && typeof this.returnFocus.focus === 'function') this.returnFocus.focus();
        this.updateTeaser();
    }

    setHash(on) {
        try {
            const { history, location } = this.view;
            if (on && !/^#countdown\b/.test(location.hash)) history.replaceState(null, '', '#countdown');
            if (!on && /^#countdown\b/.test(location.hash)) history.replaceState(null, '', location.pathname + location.search);
        } catch (_) { }
    }

    // Controls and the mouse pointer fade away after a few still seconds.
    wake() {
        this.root.classList.remove('idle');
        if (!this.view) return;
        this.view.clearTimeout(this.idleTimer);
        this.idleTimer = this.view.setTimeout(() => this.root.classList.add('idle'), 3500);
    }

    // Stops a TV or tablet from dimming while the countdown is showing, where supported.
    keepAwake(on) {
        try {
            const nav = this.view && this.view.navigator;
            if (on && nav && nav.wakeLock) {
                nav.wakeLock.request('screen').then(lock => { this.wakeLock = lock; }).catch(() => { });
            } else if (!on && this.wakeLock) {
                this.wakeLock.release().catch(() => { });
                this.wakeLock = null;
            }
        } catch (_) { }
    }

    toggleFullscreen() {
        try {
            if (document.fullscreenElement) {
                Promise.resolve(document.exitFullscreen()).catch(() => { });
            } else if (this.root.requestFullscreen) {
                Promise.resolve(this.root.requestFullscreen()).catch(() => { });
            }
        } catch (_) { }
    }

    // Sizes the canvases to the screen.
    fit() {
        if (!this.isOpen() || !this.view) return;
        const box = this.root.getBoundingClientRect();
        this.scene.resize(box.width, box.height, this.view.devicePixelRatio);
        if (this.stillScene()) this.scene.draw(30);
    }

    stillScene() {
        try {
            return Boolean(this.view.matchMedia && this.view.matchMedia('(prefers-reduced-motion: reduce)').matches);
        } catch (_) {
            return false;
        }
    }

    startScene() {
        if (!this.view.requestAnimationFrame || this.stillScene()) return;
        const start = this.view.performance ? this.view.performance.now() : 0;
        const loop = ms => {
            if (!this.isOpen()) return;
            this.scene.draw((ms - start) / 1000);
            this.frame = this.view.requestAnimationFrame(loop);
        };
        this.frame = this.view.requestAnimationFrame(loop);
    }

    // Called five times a second; only does work when the second changes.
    tick(first) {
        const state = ChristmasCountdown.at(this.now());
        const key = state.christmas ? 'christmas' : String(state.totalSeconds);
        if (key === this.lastKey) return;
        const previous = this.state;
        this.lastKey = key;
        this.state = state;
        this.render(state);

        if (first || !this.sound) return;
        if (state.christmas) {
            if (previous && !previous.christmas) {
                this.sound.play('tada');
                this.sound.play('chime');
            }
        } else if (state.totalSeconds <= 10) {
            this.sound.play('tick');
        } else if (state.minutes === 0 && state.seconds === 0) {
            this.sound.play('chime');           // on the hour
        }
    }

    render(state) {
        const finalTen = !state.christmas && state.totalSeconds <= 10;
        this.root.classList.toggle('is-christmas', state.christmas);
        this.root.classList.toggle('final-ten', finalTen);
        this.root.classList.toggle('final-minute', !state.christmas && state.totalSeconds <= 60);
        this.scene.setGlory(state.christmas);
        this.scene.setSnow(ChristmasCountdown.snowLevel(state));

        if (this.title) this.title.textContent = state.christmas ? 'Merry Christmas!' : 'Christmas is coming';
        if (this.sleeps) {
            this.sleeps.textContent = state.christmas ? 'Joy to the world, the Lord is come' : ChristmasCountdown.sleepsLine(state);
        }
        if (this.verse) {
            this.verse.textContent = state.christmas
                ? '“For unto us a child is born, unto us a son is given.” — Isaiah 9:6'
                : '“Glory to God in the highest, and on earth peace, good will toward men.” — Luke 2:14';
        }
        if (this.date) {
            this.date.textContent = state.target.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        }
        if (this.clock) this.clock.setAttribute('aria-label', ChristmasCountdown.spoken(state));

        if (this.big) {
            this.big.textContent = finalTen ? String(state.totalSeconds) : '';
            if (finalTen) {
                this.flipTurn++;
                this.big.classList.toggle('pop-a', this.flipTurn % 2 === 0);
                this.big.classList.toggle('pop-b', this.flipTurn % 2 === 1);
            }
        }
        if (state.christmas) return;

        this.setUnit('days', String(state.days), state.days === 1 ? 'day' : 'days');
        this.setUnit('hours', String(state.hours).padStart(2, '0'), state.hours === 1 ? 'hour' : 'hours');
        this.setUnit('minutes', String(state.minutes).padStart(2, '0'), state.minutes === 1 ? 'minute' : 'minutes');
        this.setUnit('seconds', String(state.seconds).padStart(2, '0'), state.seconds === 1 ? 'second' : 'seconds');
    }

    setUnit(name, text, label) {
        const unit = this.units[name];
        if (!unit) return;
        unit.label.textContent = label;
        while (unit.cards.length < text.length) {
            const card = this.makeCard();
            unit.cards.push(card);
            unit.digits.append(card);
        }
        while (unit.cards.length > text.length) unit.cards.shift().remove();
        unit.digits.dataset.value = text;
        [...text].forEach((digit, i) => this.flip(unit.cards[i], digit));
    }

    // Four pieces per card: the new top waits underneath, the old top folds down, the new
    // bottom folds into place over the old bottom. With animation off it simply shows the new digit.
    flip(card, digit) {
        const old = card.dataset.value;
        if (old === digit) return;
        const [top, bottom, flapTop, flapBottom] = card.children;
        top.textContent = digit;
        flapBottom.textContent = digit;
        bottom.textContent = old === undefined ? digit : old;
        flapTop.textContent = old === undefined ? digit : old;
        card.dataset.value = digit;
        if (old === undefined) return;
        const a = card.classList.contains('flip-a');
        card.classList.toggle('flip-a', !a);
        card.classList.toggle('flip-b', a);
    }

    // "27 sleeps until Christmas" on the buttons that open the screen. The page behind is told
    // how hard it is snowing at the same moment.
    updateTeaser() {
        const state = ChristmasCountdown.at(this.now());
        this.onSnowLevel(ChristmasCountdown.snowLevel(state));
        let text = 'Merry Christmas!';
        if (!state.christmas) {
            text = state.sleeps <= 0 ? 'Christmas is tonight' : `${state.sleeps} ${state.sleeps === 1 ? 'sleep' : 'sleeps'} until Christmas`;
        }
        this.openers.forEach(btn => {
            const slot = btn.querySelector('.countdown-btn-text');
            if (slot) slot.textContent = text;
        });
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ChristmasCountdown, CountdownScene, CountdownUI };
}
