import React, { createContext, useContext, useState, useEffect } from 'react';

const ThemeContext = createContext();

/** Match `--background`: light hsl(44 22% 96%), dark hsl(0 0% 8%). */
export const THEME_COLOR_LIGHT = '#f7f4ef';
export const THEME_COLOR_DARK = '#141414';

/**
 * iOS Safari often ignores in-place theme-color updates. Replace the meta
 * node(s) so the status-bar / notch chrome picks up the app theme.
 */
export function applyBrowserChromeTheme(isDark) {
  if (typeof document === 'undefined') return;

  const color = isDark ? THEME_COLOR_DARK : THEME_COLOR_LIGHT;

  document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => {
    meta.remove();
  });

  const themeColorMeta = document.createElement('meta');
  themeColorMeta.setAttribute('name', 'theme-color');
  themeColorMeta.setAttribute('content', color);
  document.head.appendChild(themeColorMeta);

  const tileMeta = document.querySelector('meta[name="msapplication-TileColor"]');
  if (tileMeta) {
    tileMeta.setAttribute('content', color);
  }

  const statusBarMeta = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
  if (statusBarMeta) {
    // black-translucent lets the page background fill the notch in installed PWA.
    statusBarMeta.setAttribute('content', isDark ? 'black-translucent' : 'default');
  }

  document.documentElement.style.backgroundColor = color;
  if (document.body) {
    document.body.style.backgroundColor = color;
  }
}

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

export const ThemeProvider = ({ children }) => {
  // Check for saved theme preference or default to system preference
  const [isDarkMode, setIsDarkMode] = useState(() => {
    // Check localStorage first
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) {
      return savedTheme === 'dark';
    }

    // Check system preference
    if (window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }

    return false;
  });

  // Update document class and localStorage when theme changes
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }

    applyBrowserChromeTheme(isDarkMode);
  }, [isDarkMode]);

  // Listen for system theme changes
  useEffect(() => {
    if (!window.matchMedia) return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e) => {
      // Only update if user hasn't manually set a preference
      const savedTheme = localStorage.getItem('theme');
      if (!savedTheme) {
        setIsDarkMode(e.matches);
      }
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  const toggleDarkMode = () => {
    setIsDarkMode((prev) => !prev);
  };

  const value = {
    isDarkMode,
    toggleDarkMode,
  };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
};
