export function Shell({
  title,
  subtitle,
  back,
  children,
}: {
  title: string;
  subtitle?: string;
  back?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <main>
      <header className="top">
        <div>
          {back && <div className="back">{back}</div>}
          <h1>{title}</h1>
          {subtitle && <p className="sub">{subtitle}</p>}
        </div>
        <form action="/api/logout" method="post">
          <button className="ghost">Sign out</button>
        </form>
      </header>
      {children}
    </main>
  );
}
