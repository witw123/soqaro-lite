export default function NotFoundPage() {
  return (
    <main
      style={{
        minHeight: "calc(100 * var(--app-dvh))",
        display: "grid",
        placeItems: "center",
        padding: "2rem",
        background: "linear-gradient(180deg, #0e0e14 0%, #060608 60%)",
        color: "#eee8d5",
        fontFamily: "'Inter', system-ui, sans-serif"
      }}
    >
      <div style={{ textAlign: "center" }}>
        <p
          style={{
            margin: 0,
            color: "#8b5cf6",
            letterSpacing: "0.3em",
            fontSize: "0.72rem",
            fontWeight: 600,
            textTransform: "uppercase"
          }}
        >
          Soqaro
        </p>
        <h1
          style={{
            margin: "1rem 0 0.5rem",
            fontSize: "3rem",
            fontFamily: "'Outfit', sans-serif",
            fontWeight: 800,
            letterSpacing: "-0.03em",
            background: "linear-gradient(135deg, #eee8d5, #a78bfa)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent"
          }}
        >
          404
        </h1>
        <p style={{ margin: "0 0 1.5rem", opacity: 0.55, fontSize: "1rem" }}>
          页面不存在，返回首页继续创建或加入房间。
        </p>
        <a
          href="/app"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.4rem",
            padding: "0.75rem 1.5rem",
            background: "linear-gradient(135deg, #8b5cf6, #7c3aed)",
            color: "#fff",
            borderRadius: "12px",
            textDecoration: "none",
            fontSize: "0.88rem",
            fontWeight: 500,
            boxShadow: "0 2px 16px rgba(139, 92, 246, 0.28)",
            transition: "transform 220ms ease, box-shadow 220ms ease"
          }}
        >
          返回大厅
        </a>
      </div>
    </main>
  );
}
