"use client";

import { Building2, Package, Target } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { TabPanel, Tabs } from "@/components/ui/tabs";
import { useQueryParams } from "@/lib/hooks";
import { CompanyEditor } from "./company-editor";
import { GoalsPanel } from "./goals-panel";
import { ProductsPanel } from "./products-panel";

type Tab = "company" | "goals" | "products";

export function StrategyView() {
  const { get, set } = useQueryParams();
  const raw = get("tab");
  const tab: Tab = raw === "goals" || raw === "products" ? raw : "company";

  return (
    <div>
      <PageHeader
        title="Strategy"
        description="The company constitution every agent follows, the OKRs they align to, and the products they build."
      />
      <Tabs
        idBase="strategy"
        label="Strategy sections"
        value={tab}
        onChange={(id) => set({ tab: id === "company" ? null : id, product: null })}
        tabs={[
          {
            id: "company",
            label: (
              <>
                <Building2 aria-hidden className="size-4" /> Company
              </>
            ),
          },
          {
            id: "goals",
            label: (
              <>
                <Target aria-hidden className="size-4" /> Goals & OKRs
              </>
            ),
          },
          {
            id: "products",
            label: (
              <>
                <Package aria-hidden className="size-4" /> Products
              </>
            ),
          },
        ]}
      />
      <div className="pt-6">
        {tab === "company" ? (
          <TabPanel idBase="strategy" id="company">
            <CompanyEditor />
          </TabPanel>
        ) : null}
        {tab === "goals" ? (
          <TabPanel idBase="strategy" id="goals">
            <GoalsPanel />
          </TabPanel>
        ) : null}
        {tab === "products" ? (
          <TabPanel idBase="strategy" id="products">
            <ProductsPanel />
          </TabPanel>
        ) : null}
      </div>
    </div>
  );
}
