import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

const DEPARTMENTS = ['Marketing', 'Sales', 'Operations', 'Guest Services', 'Other'];

const inputClassName =
  'w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-white placeholder-white/40 transition-all focus:border-brand-accent focus:outline-none focus:ring-1 focus:ring-brand-accent';

async function readJson(response) {
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'The request could not be completed.');
  return data;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Could not read the selected picture.'));
    reader.readAsDataURL(file);
  });
}

function GuestCardPreview({ guestId }) {
  const [guest, setGuest] = useState(null);
  const [qrCode, setQrCode] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [printError, setPrintError] = useState('');
  const [pictureFailed, setPictureFailed] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadCard() {
      try {
        const guestData = await readJson(await fetch(`/api/guests/${guestId}`));
        const code = await QRCode.toDataURL(String(guestData.id), {
          width: 180,
          margin: 1,
          color: { dark: '#1a1a2e', light: '#ffffff' },
        });
        if (active) {
          setGuest(guestData);
          setQrCode(code);
        }
      } catch (requestError) {
        if (active) setError(requestError.message || 'Could not load this guest card.');
      } finally {
        if (active) setLoading(false);
      }
    }

    loadCard();
    return () => {
      active = false;
    };
  }, [guestId]);

  async function handlePrint() {
    window.print();
    try {
      await readJson(await fetch(`/api/guests/${guestId}/prints`, {
        method: 'POST',
      }));
    } catch (requestError) {
      setPrintError(`Could not record print count: ${requestError.message || 'Request failed.'}`);
    }
  }

  return (
    <main className="guest-card-preview-screen">
      <a href="/admin" className="guest-card-preview-back">&larr; Back to admin</a>
      {loading && <p className="text-sm text-white/70">Preparing guest card…</p>}
      {error && <p role="alert" className="rounded-lg bg-red-500/10 p-4 text-red-300">{error}</p>}
      {guest && qrCode && (
        <article className="guest-card-preview-card">
          <p className="guest-card-preview-brand">BLACK COFFEE</p>
          <div className="guest-card-preview-event">Lagos Event &bull; Guest Card</div>
          <div className="guest-card-preview-picture">
            {guest.picture && !pictureFailed ? (
              <img
                src={guest.picture}
                alt={guest.name}
                onError={() => setPictureFailed(true)}
              />
            ) : (
              <span>&mdash;</span>
            )}
          </div>
          <h1 className="guest-card-preview-name">{guest.name}</h1>
          <p className="guest-card-preview-department">{guest.department}</p>
          <img className="guest-card-preview-qr" src={qrCode} alt="Guest QR code" />
          <button
            type="button"
            className="guest-card-preview-print"
            onClick={handlePrint}
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M7 8V3h10v5M7 17H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2M7 14h10v7H7zM17 12h.01" />
            </svg>
            PRINT THIS CARD
          </button>
          {printError && <p role="alert" className="guest-card-preview-error">{printError}</p>}
        </article>
      )}
    </main>
  );
}

export default function App() {
  const path = window.location.pathname.replace(/\/+$/, '');
  const isAdmin = path === '/admin';
  const previewMatch = path.match(/^\/admin\/print\/(\d+)$/);
  const previewGuestId = previewMatch ? previewMatch[1] : null;
  const [guests, setGuests] = useState([]);
  const [printedToday, setPrintedToday] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [printError, setPrintError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [registered, setRegistered] = useState(false);

  useEffect(() => {
    if (!isAdmin) {
      setLoaded(true);
      return undefined;
    }

    let active = true;
    fetch('/api/guests')
      .then(readJson)
      .then((guestRows) => {
        if (active) setGuests(guestRows);
      })
      .catch((requestError) => {
        if (active) setError(requestError.message || 'Could not load admin data.');
      })
      .finally(() => {
        if (active) setLoaded(true);
      });

    fetch('/api/prints/today')
      .then(readJson)
      .then((printData) => {
        if (active) setPrintedToday(printData.count);
      })
      .catch((requestError) => {
        if (active) setPrintError(`Could not load print count: ${requestError.message || 'Request failed.'}`);
      });

    return () => {
      active = false;
    };
  }, [isAdmin]);

  async function handleRegister(event) {
    event.preventDefault();
    setError('');
    setBusy(true);

    try {
      const form = event.currentTarget;
      const formData = new FormData(form);
      const pictureFile = formData.get('picture');
      if (pictureFile instanceof File && pictureFile.size > 10 * 1024 * 1024) {
        throw new Error('Please choose a picture under 10 MB.');
      }

      const picture = pictureFile instanceof File && pictureFile.size
        ? await readFileAsDataUrl(pictureFile)
        : null;
      const result = await readJson(await fetch('/api/guests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.get('name'),
          email: formData.get('email'),
          phone: formData.get('phone'),
          department: formData.get('department'),
          picture,
        }),
      }));

      if (!result.success) throw new Error('Could not register guest.');
      form.reset();
      setRegistered(true);
    } catch (requestError) {
      setError(requestError.message || 'Could not register guest.');
    } finally {
      setBusy(false);
    }
  }

  async function handleSearch(event) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const url = searchTerm.trim()
        ? `/api/guests/search/${encodeURIComponent(searchTerm.trim())}`
        : '/api/guests';
      setGuests(await readJson(await fetch(url)));
    } catch (requestError) {
      setError(requestError.message || 'Could not search guests.');
    } finally {
      setBusy(false);
    }
  }

  if (previewGuestId) return <GuestCardPreview guestId={previewGuestId} />;

  if (!isAdmin && registered) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-brand-primary px-4 text-brand-light">
        <section className="glass-panel w-full max-w-xl rounded-2xl p-10 text-center">
          <p className="mb-3 text-sm uppercase tracking-[0.3em] text-brand-accent">Black Coffee Lagos</p>
          <h1 className="mb-4 font-display text-4xl">Thank You</h1>
          <p className="text-lg">Guest registered successfully!</p>
          <button
            type="button"
            onClick={() => setRegistered(false)}
            className="mt-8 rounded-lg bg-brand-accent px-6 py-3 text-sm font-semibold uppercase tracking-wider text-brand-primary"
          >
            Register another guest
          </button>
        </section>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-brand-primary text-brand-light">
      {!isAdmin ? (
        <main className="px-4 py-12">
          <section className="glass-panel mx-auto max-w-2xl rounded-2xl p-6 sm:p-10">
            <p className="mb-3 text-sm uppercase tracking-[0.3em] text-brand-accent">Black Coffee Lagos</p>
            <h1 className="mb-8 border-b border-white/10 pb-4 font-display text-3xl font-light italic tracking-widest">
              Register Your Details
            </h1>
            <form onSubmit={handleRegister} className="space-y-5">
              <div>
                <label htmlFor="name" className="mb-2 block text-sm uppercase tracking-wider text-white/80">Full Name</label>
                <input id="name" name="name" type="text" required className={inputClassName} placeholder="e.g. Adeola Okafor" />
              </div>
              <div>
                <label htmlFor="email" className="mb-2 block text-sm uppercase tracking-wider text-white/80">Email Address</label>
                <input id="email" name="email" type="email" required className={inputClassName} placeholder="name@example.com" />
                <p className="mt-1 text-xs text-white/50">Email is unique in our system.</p>
              </div>
              <div>
                <label htmlFor="phone" className="mb-2 block text-sm uppercase tracking-wider text-white/80">Phone Number</label>
                <input id="phone" name="phone" type="tel" required className={inputClassName} placeholder="+234 801 234 5678" />
              </div>
              <div>
                <label htmlFor="department" className="mb-2 block text-sm uppercase tracking-wider text-white/80">Department</label>
                <select id="department" name="department" required className={inputClassName}>
                  {DEPARTMENTS.map((department) => <option key={department} value={department}>{department}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="picture" className="mb-2 block text-sm uppercase tracking-wider text-white/80">Profile Picture</label>
                <input id="picture" name="picture" type="file" accept="image/*" className={inputClassName} />
              </div>
              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-lg bg-brand-accent px-6 py-4 text-sm font-semibold uppercase tracking-wider text-brand-primary transition-opacity hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
              >
                {busy ? 'Registering…' : 'Register Guest'}
              </button>
              {error && <p role="alert" className="rounded-lg border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-300">{error}</p>}
            </form>
          </section>
        </main>
      ) : (
        <main className="px-4 py-10">
          <section className="mx-auto max-w-5xl">
            <header className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-white/10 pb-4">
              <div>
                <p className="mb-2 text-sm uppercase tracking-[0.3em] text-brand-accent">Black Coffee Lagos</p>
                <h1 className="font-display text-3xl font-light italic tracking-widest">Admin Panel — Guest List</h1>
              </div>
              <a href="/" className="text-sm text-white/60 hover:text-white">Guest registration</a>
            </header>

            <form onSubmit={handleSearch} className="mb-6 flex gap-3">
              <input
                type="search"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search guest by name…"
                className={inputClassName}
              />
              <button type="submit" disabled={busy} className="rounded-lg bg-brand-accent px-5 py-3 font-medium text-brand-primary disabled:opacity-60">
                Search
              </button>
            </form>

            {error && <p role="alert" className="mb-5 rounded-lg border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-300">{error}</p>}

            <div className="overflow-x-auto rounded-xl border border-white/10">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-white/10 bg-white/5">
                    <th className="px-4 py-3 text-xs uppercase tracking-wider text-white/60">Name</th>
                    <th className="px-4 py-3 text-xs uppercase tracking-wider text-white/60">Department</th>
                    <th className="px-4 py-3 text-xs uppercase tracking-wider text-white/60">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {loaded && guests.length === 0 ? (
                    <tr><td colSpan={3} className="px-4 py-8 text-center text-sm text-white/50">No guests found.</td></tr>
                  ) : guests.map((guest) => (
                    <tr key={guest.id} className="border-b border-white/5 last:border-0 hover:bg-white/5">
                      <td className="px-4 py-3 font-medium">{guest.name}</td>
                      <td className="px-4 py-3 text-white/70">{guest.department}</td>
                      <td className="px-4 py-3">
                        <a
                          href={`/admin/print/${guest.id}`}
                          className="rounded-lg border border-brand-accent/30 px-4 py-2 text-xs font-medium text-brand-accent hover:bg-brand-accent/10"
                        >
                          Print Card
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <footer className="mt-6 border-t border-white/10 pt-5">
              <p className="text-sm text-white/50">
                Cards printed today: <span className="font-medium text-white">{printedToday}</span>
              </p>
              {printError && <p role="alert" className="mt-2 text-sm text-red-300">{printError}</p>}
            </footer>
          </section>
        </main>
      )}
    </div>
  );
}
