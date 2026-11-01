'use client';
import { FC, ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';
import Link from 'next/link';

export const MenuItem: FC<{
  label: string;
  icon: ReactNode;
  path: string;
  onClick?: () => void;
}> = ({ label, icon, path, onClick }) => {
  const currentPath = usePathname();
  const isActive = currentPath.indexOf(path) === 0;

  const className = clsx(
    'w-full min-w-0 overflow-hidden minCustom:h-[54px] custom:h-[30px] mobile:!h-auto mobile:min-h-[44px] py-[8px] px-[6px] gap-[4px] mobile:gap-[12px] flex flex-col custom:flex-row mobile:flex-row text-[10px] font-[600] items-center minCustom:justify-center mobile:justify-start rounded-[12px] hover:text-textItemFocused hover:bg-boxFocused',
    isActive ? 'text-textItemFocused bg-boxFocused' : 'text-textItemBlur'
  );

  if (onClick) {
    return (
      <button onClick={onClick} className={className}>
        <div className="custom:hidden mobile:block">{icon}</div>
        <div className="text-[10px] mobile:text-[14px] w-full text-center mobile:text-start leading-tight">
          {label}
        </div>
      </button>
    );
  }

  return (
    <Link
      prefetch={true}
      href={path}
      {...(path.indexOf('http') === 0 && { target: '_blank' })}
      className={className}
    >
      <div className="custom:hidden mobile:block">{icon}</div>
      <div className="text-[10px] mobile:text-[14px] w-full text-center mobile:text-start leading-tight">
        {label}
      </div>
    </Link>
  );
};
