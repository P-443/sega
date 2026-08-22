# 🎲 السيجا المصرية ٣×٣ — Egyptian Sega 3×3

موقع لعب **Multiplayer لحظي (Real-Time)** للعبة السيجا المصرية الصغيرة بين لاعبين حقيقيين —
سريع جدًا، بدون Polling، Server-Authoritative ضد الغش، وبواجهة عربية RTL حديثة.

---

## ✨ المميزات

- ⚡ **Real-Time عبر WebSocket** (Socket.IO) — الحركة توصل للطرف التاني فورًا، بدون أي Polling.
- 🛡️ **Server-Authoritative**: السيرفر هو الوحيد اللي بيتحقق من الحركات ويحسب الفوز. العميل يبعت «أريد تحريك الحجر X إلى Y» فقط.
- 👑 **قاعدة حجر الخواجة**: الحجر اللي لسه ماتحركش من مكانه الأصلي (`moved = false`) عليه شارة «خ»، وأي خط **أفقي أو رأسي** فيه حجر خواجة **مش بيتحسب فوز** — القاعدة محكومة من Game Rules Engine مستقل وقابلة للضبط.
- 🏠 **غرف بكود** (Room Code) أو **دعوة لاعب بالاسم** مع إشعار لحظي (قبول/رفض).
- 🟢 **Presence System**: متصل / في مباراة / غير متصل — لحظيًا عبر WebSocket.
- 🔌 **Reconnection ذكي**: لو النت فصل، اللعبة مش بتضيع — عندك دقيقة ترجع فيها وتكمل من نفس النقطة.
- 📊 حسابات، Profiles، إحصائيات (فوز/خسارة/تعادل)، آخر المباريات، Avatars.
- 🔁 إعادة المباراة بعد انتهائها، وعروض التعادل.
- 📱 Responsive بالكامل (Mobile-first) + دعم لوحة المفاتيح و `prefers-reduced-motion`.

## 🧱 الـ Tech Stack

| الطبقة | التقنية |
|---|---|
| Frontend | Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS |
| Real-Time | Socket.IO على **نفس البورت** عبر Custom Server |
| Backend | Node.js + TypeScript (Server-Authoritative Game Manager) |
| Database | PostgreSQL + Prisma ORM |
| Auth | Username/Password · bcrypt · HTTP-only Session Cookies (DB sessions) |
| Validation | Zod + تحقق كامل في السيرفر |
| Tests | Vitest — ‏30 اختبارًا للـ Game Rules Engine |
| Deploy | Dockerfile Multi-stage جاهز لـ Coolify |

## 🏗️ المعمارية

```
┌────────────────────────────── Docker Container ─────────────────────────────┐
│  Port 3000 (0.0.0.0)                                                        │
│                                                                             │
│  Custom Server (server.ts)                                                  │
│   ├── Next.js (HTTP: صفحات + REST API)                                      │
│   └── Socket.IO (WebSocket: presence · invites · moves · sync)              │
│                                                                             │
│  Game Rules Engine (src/game)  ← نقي 100%، بدون I/O، مستقل عن React         │
│  Game Manager (src/server)     ← يمتلك الحالة، يتحقق، يخزن، يبث             │
└──────────────────────────────────┬──────────────────────────────────────────┘
                                   │ Prisma
                          ┌────────▼────────┐
                          │   PostgreSQL    │  (خدمة منفصلة على Coolify)
                          └─────────────────┘
```

### تدفق الحركة (بدون أي تأخير مصطنع)

```
Click/Touch → WebSocket → تحقق السيرفر (Engine) → DB Transaction → Broadcast → تحديث الواجهة
```

العميل **لا يرسل** حالة اللعبة أبدًا — يرسل Action فقط (`game:move` مع `gameId, stoneId, target`).

## 📜 قوانين السيجا الصغيرة (المنفذة في Engine)

- لوحة 3×3، كل لاعب 3 أحجار: A في الصف السفلي، B في العلوي.
- الحركة: خانة **مجاورة فاضية** واحدة (8 اتجاهات).
- الفوز: 3 أحجار على خط — أفقي / رأسي / قطري.
- **قاعدة الخواجة**: خط أفقي أو رأسي فيه حجر `moved = false` ⇒ **ليس فوزًا**، ويظهر تنبيه للاعب.
- القطر يُحتسب فوزًا فورًا (قابل للتعديل من `RulesConfig.khawajaBlocksDiagonal`).
- اللاعب اللي ماعندوش أي حركة قانونية **يخسر**.
- عند تجاوز حد الحركات (`maxPlies`) ⇒ تعادل. والتعادل بالاتفاق مدعوم.

القواعد كلها في `src/game/engine.ts` واختباراتها في `src/game/engine.test.ts`.

## 🚀 التشغيل محليًا

المتطلبات: Node ≥ 20 و PostgreSQL (أو Docker لقاعدة البيانات فقط).

```bash
# 1) قاعدة البيانات (اختياري عبر Docker)
docker compose up -d db

# 2) البيئة
cp .env.example .env
#   DATABASE_URL="postgresql://sega:sega@localhost:5432/sega"
#   SESSION_SECRET=<عشوائي 64 حرف>
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# 3) التثبيت + Migrations
npm ci
npx prisma migrate deploy

# 4) التطوير (HTTP + WebSocket على :3000)
npm run dev
```

## 🧪 الاختبارات

```bash
npm test          # 30 اختبارًا: الحركات، الخواجة (أفقي/رأسي/قطري)، الفوز، التعادل، الحصر
npm run typecheck # فحص TypeScript
npm run build     # بناء Production كامل
```

## 🐳 Docker

**الكل في واحد (تطبيق + PostgreSQL) بدون أي إعداد:**

```bash
docker compose up --build        # http://localhost:3000
```

**أو صورة التطبيق فقط** (مع قاعدة خارجية):

```bash
docker build -t egyptian-sega .
docker run -p 3000:3000 \
  -e DATABASE_URL="postgresql://user:pass@host:5432/db" \
  -e SESSION_SECRET="..." \
  egyptian-sega
```

- Multi-stage build · مستخدم غير root · `HEALTHCHECK` على `/api/health`.
- الـ entrypoint يطبّق `prisma migrate deploy` تلقائيًا (مع retry أثناء إقلاع القاعدة) ثم يشغّل السيرفر.
- **لا توجد أي Secrets داخل الصورة** — كل شيء من Environment Variables.

## ☁️ النشر على Coolify (خطوة بخطوة)

يعمل المشروع **بصفر Environment Variables** بأي من المسارين:

### المسار أ — Dockerfile (قاعدة بيانات مدمجة) — يعمل فورًا

إن كان تطبيقك مضبوطًا على **Build Pack: Dockerfile** فلا حاجة لتغيير شيء:
الصورة تحتوي PostgreSQL مدمجًا يقلع تلقائيًا داخل الحاوية عند غياب `DATABASE_URL`.

- **Deploy** ويعمل مباشرة ✅
- ⚠️ **حفظ البيانات**: بدون Volume تُعاد قاعدة البيانات من الصفر بعد كل redeploy.
  لتثبيتها: التطبيق ← **Storages** ← أضف Volume على المسار `/app/pgdata` ← Redeploy.
- لتثبيت الجلسات: أضف `SESSION_SECRET` ثابتًا (64 hex) في Environment Variables.

### المسار ب — Docker Compose (خدمتان منفصلتان) ⭐ الأفضل للإنتاج

الريبو يحتوي `docker-compose.yaml` فيه **التطبيق + PostgreSQL في حزمة واحدة** —
القاعدة داخل نفس الـ stack (مخزّنة في Volume دائم) والاتصال داخلي باسم `db`،
**بدون نسخ أي رابط وبدون أي Environment Variables**:

1. **Applications → New Application → Public Repository**:
   - Repository: `https://github.com/P-443/sega` · Branch: `main`
   - **Build Pack: `Docker Compose`** (وليس Dockerfile)
2. **Deploy** — Coolify يبني التطبيق ويشغّل PostgreSQL تلقائيًا، والـ migrations تتطبق عند الإقلاع.
3. **Domains**: عيّن دومينك على خدمة **`app`** (بورت 3000) — مثال `https://sega.ar-senik.pro`.
4. تحقق: `https://<domain>/api/health` ⇒ `{"ok":true,"db":"up"}`.

> WebSocket يعمل عبر نفس الدومين والبورت (ترقية الاتصال تمرّ تلقائيًا عبر بروكسي Coolify/Traefik).

**متغيرات اختيارية** (كلها لها قيم افتراضية تعمل مباشرة):

| Key | متى تضيفها |
|---|---|
| `SESSION_SECRET` | مهم: ثابت عشوائي (64 hex) **لتثبيت الجلسات** — بدونه تُصفر الجلسات عند كل إعادة نشر |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | لتغيير بيانات القاعدة الداخلية (غير مكشوفة للعامة أصلًا) |
| `DATABASE_URL` | فقط إن أردت قاعدة **خارجية** بدل المدمجة |
| `DISCONNECT_GRACE_SECONDS` | مهلة انقطاع اللاعب قبل خسارته (افتراضي 60) |

### طريقة بديلة: قاعدة PostgreSQL منفصلة + Dockerfile

1. **أنشئ خدمة PostgreSQL** (Databases → PostgreSQL → Deploy) وانسخ الـ **Internal URL**.
2. أنشئ التطبيق من الريبو بـ **Build Pack: Dockerfile** · Port: `3000`.
3. أضف `DATABASE_URL` (الـ Internal URL) و`SESSION_SECRET` من **Environment Variables** —
   وتأكد أن خيار **«Build Variable» غير مفعّل** (تفعيله يجعله وقت البناء فقط).
4. Domains ثم Deploy.

### ⚠️ أخطاء شائعة عند النشر

- **`P1012: Environment variable not found: DATABASE_URL`** ⇒ تستخدم build pack «Dockerfile» بدون قاعدة مربوطة. الحل الأسهل: بدّل إلى **Docker Compose** (الطريقة الأولى) — أو أضف `DATABASE_URL` كمتغير **runtime** (بدون «Build Variable») ثم Redeploy.
- **`P1001: Can't reach database server at db:5432`** ⇒ عرّفت `DATABASE_URL` بمضيف `db` لكن خدمة `db` غير موجودة (الـ Build Pack ليس Docker Compose). إما أن تبدّل إلى **Docker Compose**، أو **احذف `DATABASE_URL`** لتُستخدم القاعدة المدمجة تلقائيًا.
- **تُفقد البيانات بعد كل redeploy** ⇒ أنت على وضع القاعدة المدمجة بدون Volume. أضف Storage على `/app/pgdata` (المسار أ)، أو انتقل لمسار Docker Compose.
- **الدومين لا يعمل / لا شهادة HTTPS** ⇒ تأكد أن الصيغة `https://sega.example.com` (لاحظ `:` بعد https) وأن سجل DNS من نوع `A` يشير إلى IP السيرفر، وأن الدومين مُعيّن على خدمة `app`.
- **تسجيل الدخول ينسى الجلسات بعد كل نشر** ⇒ أضف `SESSION_SECRET` ثابتًا.

## 🔐 الأمان

- كلمات السر: **bcrypt** · جلسات DB برموز HMAC-hashed · كوكيز `HttpOnly; SameSite=Lax; Secure`.
- تحقق Origin في طلبات HTTP المتغيرة وفي WebSocket handshake (CSRF/CSWSH).
- Rate Limiting على الدخول/التسجيل/الدعوات/الحركات · Zod validation · Prisma (لا SQL خام من المستخدم).
- Security Headers + CSP · لا stack traces للمستخدم · لا أسرار في الـ repo.

## 📁 أهم المسارات

```
src/game/engine.ts        # Game Rules Engine (نقي — قواعد اللعبة كلها)
src/game/engine.test.ts   # 30 اختبار وحدة
src/server/gameManager.ts # إدارة المباريات: تحقق + تخزين + بث + Reconnect
src/server/socket.ts      # Socket.IO: مصادقة + Rate limit + توجيه الأحداث
src/server/presence.ts    # Presence لحظي
src/app/                  # صفحات Next.js (Lobby · Game · Profile · Settings)
server.ts                 # Custom Server (Next + Socket.IO على بورت واحد)
Dockerfile                # Multi-stage production build
```

## 🔁 إعادة الاتصال

عند انقطاع العميل: Socket.IO يعيد المحاولة تلقائيًا (backoff)، وعند العودة يطلب `game:sync`
فيستلم آخر حالة موثوقة من السيرفر ويكمل. لو تجاوز `DISCONNECT_GRACE_SECONDS` (افتراضي 60)
بدون عودة ⇒ تُحسب المباراة للطرف الآخر.

---

بالتوفيق! 🎲 لو عندك اقتراح افتح Issue.
