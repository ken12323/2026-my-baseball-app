'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function Header() {
  const pathname = usePathname();

  const navItems = [
    { name: 'HOME', path: '/' },
    { name: 'DRAFT ANALYSIS', path: '/draft-analysis' },
    { name: 'PLAYERS', path: '/players' },
    // 将来のマネタイズ用（今はモック）
    { name: 'PREMIUM', path: '/premium', isPremium: true }, 
  ];

  return (
    <header className="bg-slate-900 text-white shadow-md sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* ロゴ部分 */}
          <div className="flex-shrink-0 flex items-center">
            <Link href="/" className="font-black text-2xl tracking-tighter italic text-white">
              BASEBALL<span className="text-orange-500">ROOTS</span>
            </Link>
          </div>

          {/* ナビゲーションリンク（横スクロール対応） */}
          <nav className="flex space-x-1 md:space-x-4 overflow-x-auto no-scrollbar pl-4">
            {navItems.map((item) => {
              const isActive = pathname === item.path;
              return (
                <Link
                  key={item.name}
                  href={item.path}
                  className={`whitespace-nowrap px-3 py-2 rounded-md text-sm md:text-base font-bold transition-colors duration-200 ${
                    isActive
                      ? 'bg-blue-600 text-white'
                      : item.isPremium
                      ? 'text-amber-400 hover:bg-slate-800'
                      : 'text-slate-300 hover:bg-slate-700 hover:text-white'
                  }`}
                >
                  {item.isPremium && <span className="mr-1">👑</span>}
                  {item.name}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>
    </header>
  );
}