"use client";
import { motion, AnimatePresence } from "framer-motion";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import Logo from "../../components/logo";
import SidebarBtn from "@/app/components/dashboardSidebarBtn";
import { LinkDataType, SidebarDataType } from "../data/dashboardLinks";
import { useRouter } from "next/navigation";
import { usePermissionManager } from "@/app/components/contexts/usePermission";

export default function Sidebar({
  onClickHandler,
  isOpen,
  setIsOpen
}: {
  onClickHandler: (href: string) => void;
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
}) {
  const { filteredMenu } = usePermissionManager();
  const data: SidebarDataType[] = (() => {
    if (!filteredMenu) return [];
    // If filteredMenu items are grouped (have 'data') treat as SidebarDataType[]
    if (Array.isArray(filteredMenu) && filteredMenu.length > 0 && 'data' in filteredMenu[0]) {
      return filteredMenu as unknown as SidebarDataType[];
    }
    // Otherwise assume it's a flat LinkDataType[] and wrap into a single group
    return [
      {
        name: undefined,
        data: filteredMenu as unknown as LinkDataType[],
      },
    ];
  })();
  const [openMenus, setOpenMenus] = useState<Record<string, boolean>>({});
  // const [isOpenedByHover, setIsOpenedByHover] = useState(false);
  // const [activeHref, setActiveHref] = useState<string>("");
  const pathname = usePathname();
  const router = useRouter();
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  const toggleMenu = (label: string, siblingsToClose?: string[]) => {
    setOpenMenus((prev) => {
      const isCurrentlyOpen = prev[label] ?? false;
      const newState = { ...prev };

      // If we are opening this menu, close all siblings
      if (!isCurrentlyOpen && siblingsToClose) {
        siblingsToClose.forEach(sibling => {
          newState[sibling] = false;
        });
      }

      newState[label] = !isCurrentlyOpen;
      return newState;
    });
  };

  const handleClick = (href: string, label: string, hasChildren: boolean, siblingsToClose?: string[]) => {
    if (hasChildren) {
      toggleMenu(label, siblingsToClose);
      setIsOpen(true); // Ensure sidebar is open when interacting with menus
    } else {
      // setActiveHref(href);
      onClickHandler(href);
    }
  };

  // Helper to check if a parent menu should be active if any child is active
  // Checks if any child or grandchild is active, using pathname for reliability
  const isParentActive = (children: LinkDataType[] | undefined): boolean => {
    if (!children) return false;
    return children.some((child) => {
      if (child.href === pathname) return true;
      if (child.children && child.children.length > 0) {
        return child.children.some((grand) => grand.href === pathname);
      }
      return false;
    });
  };

  useEffect(() => {
    const current = pathname ?? (typeof window !== 'undefined' ? window.location.pathname : "");
    // setActiveHref(current);

    const initialOpen: Record<string, boolean> = {};
    data.forEach((group) => {
      group.data.forEach((link) => {
        if (link.children && link.children.length > 0) {
          // Open if any child or grandchild matches current path
          const shouldOpen = link.children.some((child) => {
            if (child.href === current) return true;
            if (child.children && child.children.length > 0) {
              return child.children.some((grand) => grand.href === current);
            }
            return false;
          });
          if (shouldOpen) {
            initialOpen[link.label] = true;
          }
        }
      });
    });

    setOpenMenus((prev) => ({ ...prev, ...initialOpen }));
  }, [pathname]);

  // close sidebar when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (e.target instanceof Node) {
        // Ignore clicks on elements that have been unmounted (e.g. the toggle SVG icon)
        if (!document.body.contains(e.target)) return;

        // Ignore clicks on the topbar toggle button
        const toggleBtn = document.getElementById("sidebar-toggle-btn");
        if (toggleBtn && toggleBtn.contains(e.target)) return;

        if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
          try { setIsOpen(false); } catch (err) { /* ignore */ }
        }
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [setIsOpen]);

  return (<>
    <div className="relative group peer" ref={wrapperRef}>
      {/* <span
      onClick={(e) => { e.stopPropagation(); setIsOpen(!isOpen) }}
      className={isOpen ? "left-[250px]" : "left-20" + " absolute top-2.5 z-100 hover:bg-gray-200 sm:bg-transparent dark:hover:bg-gray-700 dark:sm:bg-transparent rounded-md p-2 cursor-pointer"}
    >
      <Icon
        icon={isOpen === true ? "heroicons-outline:x-mark" : "heroicons-outline:menu-alt-1"}
        width={24}
        className="cursor-pointer text-[#252B37] dark:text-white"
      />
    </span> */}
      <div className={`${isOpen ? "w-[250px]" : "w-0 overflow-hidden sm:w-[80px]"} group-hover:w-[250px] h-[100vh] absolute transition-all ease-in-out duration-600 bg-white dark:bg-gray-900 z-50 pb-[40px] border-r border-gray-200 dark:border-gray-800`}>
        {/* logo */}
        <div className="w-full h-[60px] px-[16px] py-[12px] border-r-[1px] border-b-[1px] border-gray-200 dark:border-gray-800">
          <div
            onClick={() => router.push("/")}
            className={`${isOpen ? "w-full" : "w-[24px]"} transition-all ease-in-out duration-600 group-hover:w-full h-full m-auto cursor-pointer`}>
            <Logo
              width={128}
              height={35}
              twClass="object-cover h-full object-[0%_center]"
            />
          </div>
        </div>

        {/* menu */}
        <div className={`w-full h-[calc(100vh-60px)] text-sm py-5 ${isOpen ? "px-2" : "px-4"} pb-40 group-hover:px-2 transition-all ease-in-out border-[1px] border-gray-200 dark:border-gray-800 border-t-0 overflow-y-auto scrollbar-none`}>
          {data.map((group: SidebarDataType, index) => {
            const allRootLabels = data.flatMap(g => g.data.map(l => l?.label).filter(Boolean)) as string[];
            return (
              <div key={index} className={`${isOpen ? "mb-[20px]" : "m-0"} group-hover:mb-[20px]`}>
                <ul className="w-full flex flex-col gap-[6px]">
                  {group.data.map((link: LinkDataType, index) => {
                    const hasChildren = Boolean(link.children && link.children.length > 0);
                    const isChildrenOpen = openMenus[link.label] ?? false;
                    const trailingIcon = hasChildren
                      ? isChildrenOpen
                        ? "mdi-light:chevron-down"
                        : "mdi-light:chevron-right"
                      : link.trailingIcon;
                    const isActive = link.href === pathname || isParentActive(link.children);
                    return (
                      <li key={link.href + index}>
                        <div className={isActive ? "bg-red-50 rounded-xl" : ""}>
                          <SidebarBtn
                            isActive={isActive}
                            href={hasChildren ? "#" : link.href}
                            label={link.label}
                            labelTw={`${isOpen ? "block" : "hidden"} group-hover:block text-sm whitespace-nowrap`}
                            leadingIcon={link.leadingIcon}
                            leadingIconSize={20}
                            className="pr-[1px]"
                            {...(trailingIcon && { trailingIcon })}
                            trailingIconTw={`${isOpen ? "block" : "hidden"} group-hover:block`}
                            onClick={() => handleClick(link.href, link.label, hasChildren, allRootLabels)}
                            isMenu={true}
                          />
                        </div>
                        <AnimatePresence>
                          {hasChildren && isChildrenOpen && link.children && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.3, ease: "easeInOut" }}
                              className="overflow-hidden"
                            >
                              <ul className={`${isOpen ? "flex" : "hidden"} group-hover:flex mt-1 ml-[10px] flex-col gap-y-1`}>
                                {link.children.map((child: LinkDataType) => {
                                  const allChildLabels = (link.children || []).map(c => c.label).filter(Boolean) as string[];
                                  const isChildActive = child.href === pathname || (child.children && child.children.some((grand) => grand.href === pathname));
                                  const hasThirdLevel = child.children && child.children.length > 0;
                                  const isThirdLevelOpen = openMenus[child.label] ?? false;
                                  return (
                                    <li key={child.href} className="w-full">
                                      <div
                                        className={`group/link flex items-center gap-2 w-full cursor-pointer transition-all rounded-md`} // ${isChildActive ? "text-primary font-medium" : "text-(--primary-btn-color) hover:bg-(--secondary-btn-color) dark:hover:bg-primary/30"}
                                        onClick={() => {
                                          if (hasThirdLevel) {
                                            toggleMenu(child.label, allChildLabels);
                                            setIsOpen(true);
                                          } else {
                                            // setActiveHref(child.href);
                                            onClickHandler(child.href);
                                          }
                                        }}
                                      >
                                        {/* Line indicator */}
                                        <span
                                          className={`w-0.5 h-8 ml-4 shrink-0 rounded ${isChildActive ? "bg-(--primary-btn-color)" : "bg-gray-300 group-hover/link:bg-(--primary-btn-color) dark:bg-gray-700"}`}
                                        ></span>
                                        {/* Label (fills remaining space, clickable too) */}
                                        <div className="flex-1">
                                          <SidebarBtn
                                            isActive={isChildActive}
                                            href={child.href}
                                            label={child.label}
                                            // className={`${!isChildActive ? "hover:bg-transparent!" : "bg-[#FFF0F2]! dark:bg-gray-800!"}`}
                                            labelTw={`${isOpen ? "block" : "hidden"} group-hover:block`} //  ${isChildActive ? "text-[#EA0A2A] dark:text-white" : "text-[#414651] dark:text-gray-300"} 
                                            isSubmenu={true}
                                            trailingIcon={hasThirdLevel ? (isThirdLevelOpen ? "mdi-light:chevron-down" : "mdi-light:chevron-right") : child.trailingIcon}
                                            trailingIconTw={`${isChildActive ? "text-primary font-medium" : ""}`}
                                          />
                                        </div>
                                      </div>
                                      {/* 3rd level menu */}
                                      <AnimatePresence>
                                        {hasThirdLevel && isThirdLevelOpen && (
                                          <motion.div
                                            initial={{ height: 0, opacity: 0 }}
                                            animate={{ height: "auto", opacity: 1 }}
                                            exit={{ height: 0, opacity: 0 }}
                                            transition={{ duration: 0.3, ease: "easeInOut" }}
                                            className="overflow-hidden"
                                          >
                                            <ul className="ml-8 mt-1 space-y-px">
                                              {(child.children || []).map((third: LinkDataType) => {
                                                const isThirdActive = third.href === pathname;
                                                return (
                                                  <li key={third.href} className={`w-full cursor-pointer transition-all rounded ${isThirdActive ? "bg-primary/10 text-primary font-medium" : "hover:bg-primary/10 dark:hover:bg-primary/30 hover:font-medium"} group/third px-2`}>
                                                    <div
                                                      className="group/third flex items-center gap-2 w-full"
                                                      onClick={() => {
                                                        // setActiveHref(third.href);
                                                        onClickHandler(third.href);
                                                      }}
                                                    >
                                                      {/* Subtle vertical line for indentation */}
                                                      <span className={"w-1 h-6 bg-gray-200 dark:bg-gray-700 group-hover/third:bg-gray-700 rounded" + (isThirdActive ? " bg-gray-700 dark:bg-gray-200" : "")}></span>
                                                      <div className="flex-1">
                                                        <SidebarBtn
                                                          isActive={false}
                                                          href={third.href}
                                                          label={third.label}
                                                          className="hover:bg-transparent!"
                                                          labelTw={`block text-xs`} //  ${isThirdActive ? "text-primary" : "text-gray-700 dark:text-gray-200"}
                                                          isSubmenu={true}
                                                        />
                                                      </div>
                                                    </div>
                                                  </li>
                                                );
                                              })}
                                            </ul>
                                          </motion.div>
                                        )}
                                      </AnimatePresence>
                                    </li>
                                  );
                                })}
                              </ul>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  </>
  );
}