"use client";

import { IconAdjustmentsHorizontal, IconPaletteFilled, IconPhoto } from "@tabler/icons-react";
import type { ReactNode } from "react";

import { Artwork } from "@/components/studio/artwork";
import { FinishPanel } from "@/components/studio/finish";
import { Look } from "@/components/studio/look";
import { Position } from "@/components/studio/position";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useStudio } from "@/lib/store";
import { cn } from "@/lib/utils";

/**
 * The design panel — three tabs over one document.
 *
 * It used to be a single scrolling column of every control, which had two
 * problems that only show up once there are enough of them. The first is order:
 * the radius sat under the palette and above the finish for no reason other than
 * the order it was written in, so finding a control meant reading the whole
 * column. The second is that everything was always on screen, so nothing was
 * emphasised — a slider you have not touched looks exactly like the one you came
 * here to move.
 *
 * Tabs are the split the document already has. A `Direction` is a *plate* with an
 * *artwork* on it, so the panel is one tab for the plate's colours and corners,
 * one for the artwork and where it sits, and one for the finish that ties the two
 * together:
 *
 *  - **Look** — palette, field mode, corner radius.
 *  - **Logo** — the file, and the offset that positions it.
 *  - **Finish** — the shadow and the grain.
 *
 * Each trigger carries the one number worth seeing without opening it, because
 * that is the question the tab bar can answer for free: whether this document is
 * still on the reference radius, or whether a logo is loaded at all. It is cheap
 * state that turns three labels into three status readings.
 *
 * The panels are all **kept mounted**. They are small, they hold live inputs, and
 * unmounting the one you just left would throw away its scroll position and its
 * focus ring for no gain — the values live in the store, so there is nothing to
 * preserve by destroying the DOM. The inactive ones are hidden rather than removed,
 * so a screen reader walks three panels' worth of controls in document order
 * whether or not you can see them; the tab list is the only navigation.
 */
const TABS = [
  {
    id: "look",
    label: "Look",
    icon: IconPaletteFilled,
  },
  {
    id: "logo",
    label: "Logo",
    icon: IconPhoto,
  },
  {
    id: "finish",
    label: "Finish",
    icon: IconAdjustmentsHorizontal,
  },
] as const;

export function Editor({ className }: { className?: string }) {
  const radius = useStudio((s) => s.direction.radius);
  const artwork = useStudio((s) => s.direction.artwork);

  /** The one-line state reading that sits under each trigger's label. */
  const badge: Record<(typeof TABS)[number]["id"], string> = {
    // To six characters, because this is a glance and not the readout — the
    // exact value is in the tab, printed to two decimals.
    look: `${Math.round(radius)}u`,
    logo: artwork ? "Set" : "Empty",
    finish: "",
  };

  return (
    <div className={cn("flex flex-col", className)} data-slot="editor">
      <Tabs defaultValue="look">
        <TabsList className="w-full">
          {TABS.map((tab) => (
            <TabsTrigger key={tab.id} value={tab.id} data-tab={tab.id}>
              <tab.icon />
              <span>{tab.label}</span>
              {badge[tab.id] && (
                <span
                  data-slot="editor-tab-badge"
                  className="tabular-nums rounded bg-muted/80 px-1 text-[10px] text-muted-foreground"
                >
                  {badge[tab.id]}
                </span>
              )}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="look" keepMounted className="pt-3">
          <Look />
        </TabsContent>

        <TabsContent value="logo" keepMounted className="flex flex-col gap-5 pt-3">
          <Artwork />
          <Position />
          <Note>
            The whole logo survives every export: an offset mark is fitted so the
            platform&rsquo;s mask cannot crop it, which means moving it toward an
            edge shrinks the fitted export rather than clipping it. Changing the
            look keeps the logo, and where you put it.
          </Note>
        </TabsContent>

        <TabsContent value="finish" keepMounted className="pt-3">
          <FinishPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/** The quiet footnote that closes a tab. */
function Note({ children }: { children: ReactNode }) {
  return (
    <p className="text-[11px] leading-snug text-muted-foreground text-pretty">
      {children}
    </p>
  );
}
