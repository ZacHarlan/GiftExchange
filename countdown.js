// Countdown to Christmas — a full-screen winter night with a flip clock.
//
//   ChristmasCountdown  pure date maths (no browser APIs; held to the domain rules)
//   CountdownScene      the animated night: stars, aurora, moon, Santa's sleigh, village, snow,
//                       twinkling tree lights and (on Christmas Day) fireworks. Canvas only.
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

// Small seeded generator, so the landscape is the same every time and at every size.
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

class CountdownScene {
    // `back` is drawn behind the tree picture, `front` in front of it.
    constructor(back, front) {
        this.back = back || null;
        this.front = front || null;
        this.b = CountdownScene.context(this.back);
        this.f = CountdownScene.context(this.front);
        this.w = 0;
        this.h = 0;
        this.tree = null;          // where the tree picture sits, in screen pixels
        this.fireworks = false;
        this.bursts = [];
        this.nextBurst = 0;
        this.trail = [];
        this.lastT = 0;
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

    setFireworks(on) {
        this.fireworks = Boolean(on);
        if (!on) this.bursts = [];
    }

    resize(width, height, pixelRatio, treeRect) {
        if (!this.b || !this.f) return;
        const dpr = Math.min(2, Math.max(1, pixelRatio || 1));
        this.w = Math.max(1, Math.round(width));
        this.h = Math.max(1, Math.round(height));
        this.dpr = dpr;
        this.tree = treeRect || null;
        for (const canvas of [this.back, this.front]) {
            canvas.width = Math.round(this.w * dpr);
            canvas.height = Math.round(this.h * dpr);
        }
        this.b.setTransform(dpr, 0, 0, dpr, 0, 0);
        this.f.setTransform(dpr, 0, 0, dpr, 0, 0);
        this.layout();
    }

    layer() {
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(this.w * this.dpr);
        canvas.height = Math.round(this.h * this.dpr);
        const ctx = canvas.getContext('2d');
        ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        return { canvas, ctx };
    }

    // Everything that does not move is painted once here, into two layers:
    // the sky (behind the aurora) and the land (in front of it).
    layout() {
        const { w, h } = this;
        const rnd = countdownSeeded(20261225);
        const unit = Math.min(w, h * 1.7);
        this.unit = unit;
        this.moon = { x: w * 0.82, y: h * 0.2, r: unit * 0.045 };

        // Stars
        this.stars = [];
        const starCount = Math.round(Math.min(420, (w * h) / 5200));
        for (let i = 0; i < starCount; i++) {
            const y = Math.pow(rnd(), 1.4) * h * 0.66;
            this.stars.push({
                x: rnd() * w, y,
                r: rnd() < 0.08 ? 1.5 + rnd() * 0.9 : 0.5 + rnd() * 0.8,
                a: 0.35 + rnd() * 0.65,
                speed: 0.6 + rnd() * 2.2,
                phase: rnd() * Math.PI * 2,
                warm: rnd() < 0.2,
            });
        }

        // Sky layer
        const sky = this.layer();
        const g = sky.ctx.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, '#030716');
        g.addColorStop(0.4, '#081433');
        g.addColorStop(0.68, '#162452');
        g.addColorStop(0.8, '#33305f');
        g.addColorStop(1, '#3d3766');
        sky.ctx.fillStyle = g;
        sky.ctx.fillRect(0, 0, w, h);
        this.paintMoon(sky.ctx);
        this.sky = sky.canvas;

        // Land layer
        const land = this.layer();
        this.windows = [];
        this.chimneys = [];
        this.paintMountains(land.ctx, rnd);
        this.hill = x => h * 0.715 + Math.sin(x / w * 5.2 + 0.6) * h * 0.018 + Math.sin(x / w * 13 + 2) * h * 0.006;
        this.paintHill(land.ctx, rnd);
        this.paintGround(land.ctx);
        this.land = land.canvas;

        // Aurora works on a small canvas that is stretched over the sky, which blurs it softly.
        this.aurora = document.createElement('canvas');
        this.aurora.width = 220;
        this.aurora.height = 120;
        this.actx = this.aurora.getContext('2d');
        this.ribbons = [
            { color: [80, 255, 170], base: 0.62, a1: 0.13, f1: 1.1, s1: 0.11, a2: 0.05, f2: 3.1, s2: 0.17, f3: 2.3, s3: 0.23, p: 0.0 },
            { color: [70, 210, 255], base: 0.5, a1: 0.1, f1: 1.6, s1: 0.09, a2: 0.04, f2: 4.2, s2: 0.21, f3: 3.1, s3: 0.19, p: 2.1 },
            { color: [190, 110, 255], base: 0.4, a1: 0.09, f1: 0.8, s1: 0.07, a2: 0.05, f2: 2.6, s2: 0.13, f3: 1.7, s3: 0.15, p: 4.2 },
        ].map(r => ({ ...r, strip: CountdownScene.auroraStrip(r.color) }));

        // Snow, in three depths
        const area = (w * h) / (1280 * 720);
        const flakes = (count, rMin, rMax, vMin, vMax) => Array.from({ length: Math.round(count * Math.min(2.2, area)) }, () => ({
            x: rnd() * w, y: rnd() * h,
            r: rMin + rnd() * (rMax - rMin),
            v: vMin + rnd() * (vMax - vMin),
            sway: 6 + rnd() * 22, f: 0.3 + rnd() * 0.9, phase: rnd() * Math.PI * 2,
        }));
        this.snowFar = flakes(150, 0.6, 1.3, 14, 28);
        this.snowMid = flakes(90, 1.3, 2.4, 32, 58);
        this.snowNear = flakes(34, 3, 6.5, 70, 125);
        this.flake = CountdownScene.softDot(32, '255,255,255');

        // Lights on the tree picture
        this.bulbs = [];
        const colors = ['255,90,100', '255,214,110', '80,230,150', '110,185,255', '255,255,255'];
        for (let i = 0; i < 30; i++) {
            const v = 0.3 + rnd() * 0.5;                    // height within the picture
            const half = (v - 0.24) * 0.2;                  // the tree widens towards the ground
            this.bulbs.push({
                u: 0.463 + (rnd() * 2 - 1) * half, v,
                color: colors[i % colors.length],
                speed: 0.8 + rnd() * 2.4, phase: rnd() * Math.PI * 2,
            });
        }
        this.glows = Object.fromEntries(colors.concat('255,200,90').map(c => [c, CountdownScene.softDot(48, c)]));
    }

    static softDot(size, rgb) {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = size;
        const ctx = canvas.getContext('2d');
        const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
        g.addColorStop(0, `rgba(${rgb},1)`);
        g.addColorStop(0.25, `rgba(${rgb},0.75)`);
        g.addColorStop(1, `rgba(${rgb},0)`);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, size, size);
        return canvas;
    }

    // One vertical slice of an aurora curtain: faint at the top, brightest at its lower edge.
    static auroraStrip([r, g, b]) {
        const canvas = document.createElement('canvas');
        canvas.width = 1;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');
        const grad = ctx.createLinearGradient(0, 0, 0, 64);
        grad.addColorStop(0, `rgba(${r},${g},${b},0)`);
        grad.addColorStop(0.55, `rgba(${r},${g},${b},0.28)`);
        grad.addColorStop(0.9, `rgba(${r},${g},${b},0.95)`);
        grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 1, 64);
        return canvas;
    }

    paintMoon(ctx) {
        const { x, y, r } = this.moon;
        const halo = ctx.createRadialGradient(x, y, r * 0.6, x, y, r * 6);
        halo.addColorStop(0, 'rgba(255,244,214,0.42)');
        halo.addColorStop(0.25, 'rgba(210,220,255,0.14)');
        halo.addColorStop(1, 'rgba(180,200,255,0)');
        ctx.fillStyle = halo;
        ctx.fillRect(x - r * 6, y - r * 6, r * 12, r * 12);
        const disc = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
        disc.addColorStop(0, '#fffdf2');
        disc.addColorStop(1, '#f1e6c4');
        ctx.fillStyle = disc;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(190,175,140,0.28)';
        for (const [dx, dy, s] of [[-0.3, -0.15, 0.2], [0.25, 0.3, 0.26], [0.35, -0.35, 0.13], [-0.15, 0.45, 0.1], [-0.55, 0.25, 0.09]]) {
            ctx.beginPath();
            ctx.arc(x + dx * r, y + dy * r, s * r, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    paintMountains(ctx, rnd) {
        const { w, h } = this;
        const ranges = [
            { base: 0.7, peak: 0.2, step: 0.11, top: '#55679f', bottom: '#18224a' },
            { base: 0.72, peak: 0.13, step: 0.075, top: '#3d4d86', bottom: '#131b3f' },
        ];
        for (const range of ranges) {
            const points = [[-0.05 * w, h * range.base]];
            let x = -0.05 * w;
            let up = true;
            let top = h;
            while (x < w * 1.05) {
                x += w * range.step * (0.55 + rnd() * 0.7);
                const y = h * (range.base - (up ? range.peak * (0.45 + rnd() * 0.55) : range.peak * rnd() * 0.25));
                top = Math.min(top, y);
                points.push([x, y]);
                up = !up;
            }
            const g = ctx.createLinearGradient(0, top, 0, h * range.base);
            g.addColorStop(0, range.top);
            g.addColorStop(0.45, range.bottom);
            g.addColorStop(1, range.bottom);
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.moveTo(points[0][0], h);
            points.forEach(([px, py]) => ctx.lineTo(px, py));
            ctx.lineTo(w * 1.1, h);
            ctx.closePath();
            ctx.fill();
        }
    }

    paintPine(ctx, x, y, size, color) {
        ctx.fillStyle = color;
        for (let i = 0; i < 3; i++) {
            const top = y - size * (1 - i * 0.24);
            const bottom = y - size * (0.42 - i * 0.2);
            const half = size * (0.17 + i * 0.09);
            ctx.beginPath();
            ctx.moveTo(x, top);
            ctx.lineTo(x + half, bottom);
            ctx.lineTo(x - half, bottom);
            ctx.closePath();
            ctx.fill();
        }
        ctx.fillRect(x - size * 0.03, y - size * 0.05, size * 0.06, size * 0.07);
    }

    paintHill(ctx, rnd) {
        const { w, h, unit } = this;
        const hill = this.hill;

        // Pines behind the village
        for (let x = -10; x < w + 10; x += unit * (0.012 + rnd() * 0.02)) {
            this.paintPine(ctx, x, hill(x) + 2, unit * (0.03 + rnd() * 0.035), '#0c1433');
        }

        // The snowy hill itself
        const g = ctx.createLinearGradient(0, h * 0.69, 0, h * 0.9);
        g.addColorStop(0, '#8fa3da');
        g.addColorStop(0.2, '#5f73b3');
        g.addColorStop(1, '#3a4a86');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(0, h);
        for (let x = 0; x <= w; x += 8) ctx.lineTo(x, hill(x));
        ctx.lineTo(w, h);
        ctx.closePath();
        ctx.fill();

        // Village: two clusters, leaving the middle clear for the big tree
        const spots = [0.06, 0.115, 0.17, 0.225, 0.285, 0.34, 0.66, 0.715, 0.775, 0.83, 0.885, 0.94];
        const churchAt = 3;
        spots.forEach((s, i) => {
            const x = s * w + (rnd() - 0.5) * w * 0.012;
            const size = unit * (0.026 + rnd() * 0.012) * (i === churchAt ? 1.25 : 1);
            this.paintHouse(ctx, x, hill(x) + size * 0.25, size, rnd, i === churchAt);
        });

        // A few pines in front of the houses
        for (let i = 0; i < 16; i++) {
            const x = rnd() * w;
            if (x > w * 0.4 && x < w * 0.6) continue;
            this.paintPine(ctx, x, hill(x) + unit * 0.035, unit * (0.035 + rnd() * 0.03), '#0a112b');
        }
    }

    paintHouse(ctx, x, y, size, rnd, church) {
        const bw = size * (church ? 1.1 : 1.3 + rnd() * 0.5);
        const bh = size * (church ? 1.1 : 0.75 + rnd() * 0.25);
        const roof = size * (0.55 + rnd() * 0.2);
        ctx.fillStyle = '#141a3c';
        ctx.fillRect(x - bw / 2, y - bh, bw, bh);
        // Chimney
        if (!church) {
            const cx = x + bw * (rnd() < 0.5 ? -0.25 : 0.25);
            ctx.fillRect(cx - size * 0.07, y - bh - roof * 0.85, size * 0.14, roof * 0.6);
            if (rnd() < 0.6) this.chimneys.push({ x: cx, y: y - bh - roof * 0.85, size, phase: rnd() * 10 });
        }
        // Snowy roof
        ctx.fillStyle = '#d6e1fb';
        ctx.beginPath();
        ctx.moveTo(x - bw * 0.6, y - bh);
        ctx.lineTo(x, y - bh - roof);
        ctx.lineTo(x + bw * 0.6, y - bh);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#141a3c';
        ctx.beginPath();
        ctx.moveTo(x - bw * 0.46, y - bh);
        ctx.lineTo(x, y - bh - roof * 0.74);
        ctx.lineTo(x + bw * 0.46, y - bh);
        ctx.closePath();
        ctx.fill();
        if (church) {
            const tw = bw * 0.3;
            const th = bh * 1.5;
            ctx.fillRect(x - tw / 2, y - bh - th, tw, th);
            ctx.fillStyle = '#d6e1fb';
            ctx.beginPath();
            ctx.moveTo(x - tw * 0.75, y - bh - th);
            ctx.lineTo(x, y - bh - th - size * 1.1);
            ctx.lineTo(x + tw * 0.75, y - bh - th);
            ctx.closePath();
            ctx.fill();
            this.windows.push({ x: x - tw * 0.2, y: y - bh - th * 0.75, w: tw * 0.4, h: th * 0.28, phase: rnd() * 6 });
        }
        // Lit windows
        const cols = church ? 2 : 2 + (rnd() < 0.4 ? 1 : 0);
        for (let c = 0; c < cols; c++) {
            if (!church && rnd() < 0.18) continue;
            const ww = bw * 0.16;
            const wx = x - bw / 2 + bw * ((c + 0.5) / cols) - ww / 2;
            this.windows.push({ x: wx, y: y - bh * 0.72, w: ww, h: bh * 0.36, phase: rnd() * 6 });
        }
    }

    // The snow the big tree stands on.
    paintGround(ctx) {
        const { w, h } = this;
        const drift = (top, dip, a, b, colors) => {
            const g = ctx.createLinearGradient(0, h * top, 0, h);
            colors.forEach(([stop, color]) => g.addColorStop(stop, color));
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.moveTo(0, h);
            for (let x = 0; x <= w; x += 8) {
                const u = x / w;
                ctx.lineTo(x, h * (top + dip * Math.sin(u * a + b) + 0.012 * Math.sin(u * 17 + b)));
            }
            ctx.lineTo(w, h);
            ctx.closePath();
            ctx.fill();
        };
        drift(0.8, 0.018, 4.2, 1.2, [[0, '#a9bcec'], [1, '#6f84c4']]);
        drift(0.845, 0.014, 3.1, 4, [[0, '#f4f8ff'], [0.35, '#d5e0fb'], [1, '#9fb3e6']]);
    }

    // --- Drawing a frame ---

    draw(t) {
        if (!this.ready()) return;
        const dt = Math.min(0.1, Math.max(0, t - this.lastT));
        this.lastT = t;
        const { b, f, w, h } = this;

        b.globalAlpha = 1;
        b.globalCompositeOperation = 'source-over';
        b.drawImage(this.sky, 0, 0, w, h);
        this.drawStars(b, t);
        this.drawAurora(b, t);
        this.drawShootingStar(b, t);
        this.drawSleigh(b, t, dt);
        b.drawImage(this.land, 0, 0, w, h);
        this.drawWindows(b, t);
        this.drawSmoke(b, t);
        this.drawSnow(b, this.snowFar, t, 0.55, false);
        this.drawSnow(b, this.snowMid, t, 0.8, false);

        f.clearRect(0, 0, w, h);
        this.drawTreeLights(f, t);
        this.drawSnow(f, this.snowNear, t, 0.5, true);
        this.drawFireworks(f, t, dt);
    }

    drawStars(ctx, t) {
        for (const s of this.stars) {
            const twinkle = 0.55 + 0.45 * Math.sin(t * s.speed + s.phase);
            ctx.globalAlpha = s.a * twinkle;
            ctx.fillStyle = s.warm ? '#ffe9c2' : '#eaf1ff';
            ctx.beginPath();
            ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
            ctx.fill();
            if (s.r > 1.5) {
                ctx.globalAlpha = s.a * twinkle * 0.5;
                ctx.fillRect(s.x - s.r * 3.5, s.y - 0.4, s.r * 7, 0.8);
                ctx.fillRect(s.x - 0.4, s.y - s.r * 3.5, 0.8, s.r * 7);
            }
        }
        ctx.globalAlpha = 1;
    }

    drawAurora(ctx, t) {
        const a = this.actx;
        const aw = this.aurora.width;
        const ah = this.aurora.height;
        a.clearRect(0, 0, aw, ah);
        a.globalCompositeOperation = 'lighter';
        for (const r of this.ribbons) {
            for (let i = 0; i < aw; i++) {
                const u = i / aw;
                const y = ah * (r.base
                    + r.a1 * Math.sin(u * r.f1 * 6.283 + t * r.s1 + r.p)
                    + r.a2 * Math.sin(u * r.f2 * 6.283 - t * r.s2 + r.p * 2));
                const wave = 0.5 + 0.5 * Math.sin(u * r.f3 * 6.283 + t * r.s3 + r.p * 3);
                const rays = 0.72 + 0.28 * Math.sin(i * 1.9 + t * 0.7 + r.p);
                const strength = wave * wave * rays;
                const height = ah * (0.28 + 0.42 * strength);
                a.globalAlpha = 0.1 + 0.6 * strength;
                a.drawImage(r.strip, i, y - height, 1, height);
            }
        }
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.72;
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(this.aurora, 0, this.h * 0.02, this.w, this.h * 0.66);
        ctx.restore();
    }

    // One streak every eleven seconds or so, in a different place each time.
    drawShootingStar(ctx, t) {
        const period = 11;
        const n = Math.floor(t / period);
        const p = (t - n * period) / 0.9;
        if (p > 1) return;
        const rnd = countdownSeeded(n * 7919 + 13);
        const x0 = this.w * (0.1 + rnd() * 0.6);
        const y0 = this.h * (0.05 + rnd() * 0.25);
        const len = this.unit * 0.16;
        const x = x0 + p * len * 1.6;
        const y = y0 + p * len * 0.7;
        const g = ctx.createLinearGradient(x, y, x - len * 0.55, y - len * 0.24);
        const fade = Math.sin(p * Math.PI);
        g.addColorStop(0, `rgba(255,255,255,${0.95 * fade})`);
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.strokeStyle = g;
        ctx.lineWidth = 1.8;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - len * 0.55, y - len * 0.24);
        ctx.stroke();
    }

    // Santa crosses the sky, in front of the moon, every 50 seconds.
    drawSleigh(ctx, t, dt) {
        const period = 50;
        const flight = 17;
        const local = (t + 44) % period;          // first pass a few seconds after opening
        const { w, h, moon } = this;
        const s = this.unit * 0.00115;            // drawing units -> pixels

        // Sparkle trail (kept and faded even after the sleigh has gone)
        this.trail = this.trail.filter(p => (p.life -= dt) > 0);
        for (const p of this.trail) {
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            const a = Math.min(1, p.life / 1.2);
            ctx.globalAlpha = a * 0.75;
            const size = p.size * (0.4 + a * 0.6);
            ctx.drawImage(this.glows['255,200,90'], p.x - size / 2, p.y - size / 2, size, size);
        }
        ctx.globalAlpha = 1;
        if (local > flight) return;

        const p = local / flight;
        const x = -0.2 * w + p * 1.4 * w;
        const pathY = px => moon.y + h * 0.42 * Math.pow((px - moon.x) / w, 2);
        const y = pathY(x);
        const angle = Math.atan2(pathY(x + 4) - pathY(x - 4), 8);

        if (dt > 0) {
            for (let i = 0; i < 1; i++) {
                this.trail.push({
                    x: x - Math.cos(angle) * 34 * s + (Math.random() - 0.5) * 10 * s,
                    y: y - Math.sin(angle) * 34 * s + (Math.random() - 0.5) * 12 * s,
                    vx: -12 - Math.random() * 18, vy: 6 + Math.random() * 16,
                    life: 0.7 + Math.random() * 1.1, size: (3 + Math.random() * 6) * s,
                });
            }
        }

        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle);
        ctx.scale(s, s);
        ctx.fillStyle = '#060a1a';
        ctx.strokeStyle = '#060a1a';
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        // Reins
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(26, -8);
        ctx.lineTo(196, -6);
        ctx.stroke();

        // Sleigh
        ctx.beginPath();
        ctx.moveTo(-30, -20);
        ctx.quadraticCurveTo(-34, 8, -18, 10);
        ctx.lineTo(20, 10);
        ctx.quadraticCurveTo(36, 8, 34, -12);
        ctx.quadraticCurveTo(26, -2, 16, -4);
        ctx.lineTo(-12, -4);
        ctx.quadraticCurveTo(-22, -6, -30, -20);
        ctx.fill();
        ctx.lineWidth = 2.2;
        ctx.beginPath();                                   // runner
        ctx.moveTo(-32, 19);
        ctx.lineTo(28, 19);
        ctx.quadraticCurveTo(42, 18, 40, 6);
        ctx.moveTo(-20, 10);
        ctx.lineTo(-22, 19);
        ctx.moveTo(18, 10);
        ctx.lineTo(20, 19);
        ctx.stroke();
        ctx.beginPath();                                   // sack
        ctx.arc(-17, -15, 12, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();                                   // Santa
        ctx.arc(4, -13, 10, 0, Math.PI * 2);
        ctx.arc(7, -26, 5.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();                                   // hat
        ctx.moveTo(2, -29);
        ctx.quadraticCurveTo(2, -40, -9, -36);
        ctx.lineTo(12, -29);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.arc(-9, -36, 2.4, 0, Math.PI * 2);
        ctx.fill();

        // Reindeer
        const gallop = t * 9;
        [78, 126, 174].forEach((rx, i) => this.drawReindeer(ctx, rx, -4 + Math.sin(gallop + i * 1.3) * 2.5, gallop + i * 1.3, i === 2));
        ctx.restore();
    }

    drawReindeer(ctx, x, y, phase, leader) {
        ctx.save();
        ctx.translate(x, y);
        ctx.beginPath();
        ctx.ellipse(0, 0, 16, 6.5, 0, 0, Math.PI * 2);    // body
        ctx.fill();
        ctx.lineWidth = 5.5;
        ctx.beginPath();                                   // neck
        ctx.moveTo(12, -2);
        ctx.lineTo(21, -14);
        ctx.stroke();
        ctx.beginPath();                                   // head
        ctx.ellipse(25, -16, 6.5, 3.6, -0.25, 0, Math.PI * 2);
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.beginPath();                                   // antlers, ear, tail
        ctx.moveTo(21, -18); ctx.lineTo(17, -30);
        ctx.moveTo(18.5, -25); ctx.lineTo(14, -27);
        ctx.moveTo(19.5, -22); ctx.lineTo(23, -27);
        ctx.moveTo(23, -19); ctx.lineTo(22, -31);
        ctx.moveTo(22.4, -26); ctx.lineTo(26, -30);
        ctx.moveTo(-15, -3); ctx.lineTo(-20, -7);
        ctx.stroke();
        ctx.lineWidth = 2.4;
        const swing = Math.sin(phase);
        const leg = (hx, a, bend) => {
            const kx = hx + Math.sin(a) * 9;
            const ky = 4 + Math.cos(a) * 9;
            ctx.moveTo(hx, 4);
            ctx.lineTo(kx, ky);
            ctx.lineTo(kx + Math.sin(a + bend) * 9, ky + Math.cos(a + bend) * 9);
        };
        ctx.beginPath();
        leg(10, 0.9 * swing + 0.25, -0.5 * swing - 0.3);
        leg(12, 0.9 * swing - 0.15, -0.5 * swing - 0.3);
        leg(-11, -0.9 * swing - 0.2, 0.5 * swing + 0.4);
        leg(-13, -0.9 * swing + 0.2, 0.5 * swing + 0.4);
        ctx.stroke();
        if (leader) {                                      // a certain red nose
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            ctx.drawImage(this.glows['255,90,100'], 31.5 - 9, -16.5 - 9, 18, 18);
            ctx.restore();
        }
        ctx.restore();
    }

    drawWindows(ctx, t) {
        ctx.save();
        ctx.shadowColor = 'rgba(255,190,90,0.9)';
        ctx.shadowBlur = this.unit * 0.008;
        for (const win of this.windows) {
            const flicker = 0.78 + 0.22 * Math.sin(t * 1.3 + win.phase) * Math.sin(t * 0.37 + win.phase * 2);
            ctx.fillStyle = `rgba(255,${200 + Math.round(20 * flicker)},120,${flicker})`;
            ctx.fillRect(win.x, win.y, win.w, win.h);
        }
        ctx.restore();
    }

    drawSmoke(ctx, t) {
        ctx.fillStyle = '#b9c6ee';
        for (const c of this.chimneys) {
            for (let i = 0; i < 5; i++) {
                const p = ((t * 0.16 + c.phase + i / 5) % 1);
                ctx.globalAlpha = 0.16 * (1 - p);
                ctx.beginPath();
                ctx.arc(c.x + Math.sin(p * 4 + c.phase) * c.size * 0.25 + p * c.size * 0.6, c.y - p * c.size * 1.9, c.size * (0.1 + p * 0.28), 0, Math.PI * 2);
                ctx.fill();
            }
        }
        ctx.globalAlpha = 1;
    }

    drawSnow(ctx, flakes, t, alpha, soft) {
        const { w, h } = this;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = '#ffffff';
        if (!soft) ctx.beginPath();
        for (const fl of flakes) {
            const y = (fl.y + t * fl.v) % (h + 20) - 10;
            const x = ((fl.x + Math.sin(t * fl.f + fl.phase) * fl.sway + t * fl.v * 0.12) % (w + 20) + w + 20) % (w + 20) - 10;
            if (soft) {
                ctx.drawImage(this.flake, x - fl.r * 2, y - fl.r * 2, fl.r * 4, fl.r * 4);
            } else {
                ctx.moveTo(x + fl.r, y);
                ctx.arc(x, y, fl.r, 0, Math.PI * 2);
            }
        }
        if (!soft) ctx.fill();
        ctx.globalAlpha = 1;
    }

    // Coloured lights twinkling on the tree picture, and a glowing star on top.
    drawTreeLights(ctx, t) {
        const tree = this.tree;
        if (!tree || tree.width <= 0) return;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const base = tree.width * 0.022;
        for (const bulb of this.bulbs) {
            const on = 0.5 + 0.5 * Math.sin(t * bulb.speed + bulb.phase);
            ctx.globalAlpha = 0.25 + 0.75 * on * on;
            const size = base * (0.8 + on * 0.6);
            ctx.drawImage(this.glows[bulb.color], tree.left + bulb.u * tree.width - size / 2, tree.top + bulb.v * tree.height - size / 2, size, size);
        }
        const sx = tree.left + tree.width * 0.463;
        const sy = tree.top + tree.height * 0.185;
        const pulse = 0.7 + 0.3 * Math.sin(t * 1.7);
        const star = tree.width * 0.14 * pulse;
        ctx.globalAlpha = 0.85;
        ctx.drawImage(this.glows['255,200,90'], sx - star / 2, sy - star / 2, star, star);
        ctx.globalAlpha = 0.55 * pulse;
        ctx.fillStyle = '#fff1c4';
        const ray = tree.width * 0.07 * pulse;
        ctx.translate(sx, sy);
        ctx.rotate(t * 0.15);
        for (let i = 0; i < 4; i++) {
            ctx.rotate(Math.PI / 4);
            ctx.beginPath();
            ctx.moveTo(-ray, 0);
            ctx.lineTo(0, -ray * 0.05);
            ctx.lineTo(ray, 0);
            ctx.lineTo(0, ray * 0.05);
            ctx.closePath();
            ctx.fill();
        }
        ctx.restore();
    }

    drawFireworks(ctx, t, dt) {
        if (!this.fireworks && this.bursts.length === 0) return;
        const { w, h } = this;
        if (this.fireworks && t >= this.nextBurst && dt > 0) {
            this.nextBurst = t + 0.3 + Math.random() * 0.55;
            const palette = ['255,90,100', '255,214,110', '80,230,150', '110,185,255', '255,255,255', '255,200,90'];
            const color = palette[Math.floor(Math.random() * palette.length)];
            const cx = w * (0.1 + Math.random() * 0.8);
            const cy = h * (0.1 + Math.random() * 0.38);
            const power = this.unit * (0.22 + Math.random() * 0.16);
            const sparks = [];
            for (let i = 0; i < 110; i++) {
                const a = (i / 110) * Math.PI * 2 + Math.random() * 0.1;
                const v = power * (i % 3 === 0 ? 0.45 + Math.random() * 0.2 : 0.8 + Math.random() * 0.2);
                sparks.push({ x: cx, y: cy, vx: Math.cos(a) * v, vy: Math.sin(a) * v });
            }
            this.bursts.push({ color, sparks, age: 0, life: 1.7 + Math.random() * 0.5 });
        }
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        this.bursts = this.bursts.filter(burst => (burst.age += dt) < burst.life);
        for (const burst of this.bursts) {
            const fade = 1 - burst.age / burst.life;
            const glow = this.glows[burst.color];
            const size = this.unit * 0.02 * (0.5 + fade);
            const core = size * 0.45;
            const white = this.glows['255,255,255'];
            ctx.globalAlpha = Math.min(1, fade * 1.8);
            for (const sp of burst.sparks) {
                sp.vx *= 1 - 1.5 * dt;
                sp.vy = sp.vy * (1 - 1.5 * dt) + this.unit * 0.05 * dt;
                sp.x += sp.vx * dt;
                sp.y += sp.vy * dt;
                ctx.drawImage(glow, sp.x - size / 2, sp.y - size / 2, size, size);
                ctx.drawImage(white, sp.x - core / 2, sp.y - core / 2, core, core);
            }
        }
        ctx.restore();
    }
}

// --- The screen ---

class CountdownUI {
    // options: root (the #countdownScreen element), openers (buttons that open it and show the
    // "N sleeps" teaser), sound ({ play(name) }), now (() => Date), onOpen (called when opened),
    // view (window; injected in tests).
    constructor(options) {
        this.root = options.root;
        this.openers = options.openers || [];
        this.sound = options.sound || null;
        this.now = options.now || (() => new Date());
        this.onOpen = options.onOpen || (() => { });
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
        this.treeImg = find('countdownTree');
        this.scene = new CountdownScene(find('countdownSky'), find('countdownSnow'));

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
        if (this.treeImg) this.treeImg.addEventListener('load', () => this.fit());

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
        if (this.sound) this.sound.play('jingle');
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

    // Sizes the canvases to the screen and tells the scene where the tree picture is.
    fit() {
        if (!this.isOpen() || !this.view) return;
        const box = this.root.getBoundingClientRect();
        let tree = null;
        if (this.treeImg) {
            const r = this.treeImg.getBoundingClientRect();
            tree = { left: r.left - box.left, top: r.top - box.top, width: r.width, height: r.height };
        }
        this.scene.resize(box.width, box.height, this.view.devicePixelRatio, tree);
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
                this.sound.play('jingle');
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
        this.scene.setFireworks(state.christmas);

        if (this.title) this.title.textContent = state.christmas ? 'Merry Christmas!' : 'Christmas is coming';
        if (this.sleeps) {
            this.sleeps.textContent = state.christmas ? 'It’s Christmas Day — enjoy every minute of it' : ChristmasCountdown.sleepsLine(state);
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

    // "🎄 27 sleeps until Christmas" on the buttons that open the screen.
    updateTeaser() {
        const state = ChristmasCountdown.at(this.now());
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
