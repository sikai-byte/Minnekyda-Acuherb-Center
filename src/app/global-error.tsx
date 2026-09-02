'use client';

export default function GlobalError() {
  return (
    <html lang="en">
      <body>
        <div style={{ fontFamily: 'system-ui', margin: '4rem auto', maxWidth: '28rem', textAlign: 'center' }}>
          <h1>Something went wrong</h1>
          <p>Nothing was saved. Please reload the page.</p>
        </div>
      </body>
    </html>
  );
}
