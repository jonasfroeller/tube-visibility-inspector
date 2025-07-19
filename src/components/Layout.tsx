import { ReactNode } from "react";

const Header = () => {
  return (
    <header className="sticky top-0 z-10 p-4 text-white bg-gray-800">
      <div className="flex justify-between items-center mx-auto max-w-6xl">
        <div className="text-xl">Tube Visibility Inspector</div>
        <a
          href="https://github.com/jonasfroeller/tube-visibility-inspector"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center space-x-2 text-gray-300 hover:text-white"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 24 24"><rect width="24" height="24" fill="none"/><path fill="currentColor" d="M12 2A10 10 0 0 0 2 12c0 4.42 2.87 8.17 6.84 9.5c.5.08.66-.23.66-.5v-1.69c-2.77.6-3.36-1.34-3.36-1.34c-.46-1.16-1.11-1.47-1.11-1.47c-.91-.62.07-.6.07-.6c1 .07 1.53 1.03 1.53 1.03c.87 1.52 2.34 1.07 2.91.83c.09-.65.35-1.09.63-1.34c-2.22-.25-4.55-1.11-4.55-4.92c0-1.11.38-2 1.03-2.71c-.1-.25-.45-1.29.1-2.64c0 0 .84-.27 2.75 1.02c.79-.22 1.65-.33 2.5-.33s1.71.11 2.5.33c1.91-1.29 2.75-1.02 2.75-1.02c.55 1.35.2 2.39.1 2.64c.65.71 1.03 1.6 1.03 2.71c0 3.82-2.34 4.66-4.57 4.91c.36.31.69.92.69 1.85V21c0 .27.16.59.67.5C19.14 20.16 22 16.42 22 12A10 10 0 0 0 12 2"/></svg>
        </a>
      </div>
    </header>
  );
};

const Footer = () => {
  return (
    <footer className="p-4 text-sm text-center text-gray-700 bg-gray-200">
      <div className="flex flex-col justify-between items-center mx-auto space-y-2 max-w-6xl sm:flex-row sm:space-y-0">
        <div className="flex items-center space-x-2">
          <img src="https://avatars.githubusercontent.com/u/121523551?v=4" alt="Jonas Fröller" className="w-6 h-6 rounded-full" />
          <span>
            Made by <a href="https://jonasfroeller.is-a.dev" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Jonas Fröller</a>
          </span>
        </div>
        <div className="flex items-center space-x-2">
          <img src="https://merginit.com/favicon.png" alt="Imprint" className="w-6 h-6" />
          <a href="https://merginit.com/legal/imprint" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
            Imprint
          </a>
        </div>
      </div>
    </footer>
  );
};

interface LayoutProps {
  children: ReactNode;
}

const Layout = ({ children }: LayoutProps) => {
  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      <main className="flex-grow">
        {children}
      </main>
      <Footer />
    </div>
  );
};

export default Layout;
