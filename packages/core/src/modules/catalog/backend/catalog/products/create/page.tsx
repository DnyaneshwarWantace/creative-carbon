"use client"

import * as React from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Page, PageBody } from "@open-mercato/ui/backend/Page"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@open-mercato/ui/primitives/card"
import { Button } from "@open-mercato/ui/primitives/button"
import { Input } from "@open-mercato/ui/primitives/input"
import { Label } from "@open-mercato/ui/primitives/label"
import { Textarea } from "@open-mercato/ui/primitives/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@open-mercato/ui/primitives/select"
import {
  Package,
  Layers,
  Sparkles,
  DollarSign,
  ShieldCheck,
  FlaskConical,
  Boxes,
  ArrowLeft,
  Info,
  CheckCircle2,
  Clock,
  Warehouse,
} from "lucide-react"
import { createCrud } from "@open-mercato/ui/backend/utils/crud"
import { apiCall } from "@open-mercato/ui/backend/utils/apiCall"
import { flash } from "@open-mercato/ui/backend/FlashMessages"
import { useT } from "@open-mercato/shared/lib/i18n/context"
import { useOrganizationScopeDetail } from "@open-mercato/shared/lib/frontend/useOrganizationScope"

export type InventoryCategory = "fg" | "rm" | "pm" | "bulk" | "rd"

// Maps this page's inventory-category tabs to the 4 fieldset codes seeded by
// seedDermatProductFieldsets (apps/mercato/src/modules/dermat_sales_flow/lib/seeds.ts).
// Tab values and fieldset codes are NOT the same strings — R&D ("rd") has no
// matching fieldset/category-group and intentionally maps to undefined, so
// R&D products show only the always-shown backbone fields.
const INVENTORY_CATEGORY_TO_FIELDSET: Record<InventoryCategory, string | undefined> = {
  fg: "finished_goods",
  rm: "raw_material",
  pm: "packing_material",
  bulk: "bulk",
  rd: undefined,
}

const CATEGORY_TABS: { id: InventoryCategory; label: string; sub: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "fg", label: "Finished Goods (FG)", sub: "Packaged Skincare & Cosmetics", icon: Package },
  { id: "rm", label: "Raw Materials (RM)", sub: "Chemicals, Actives & Fragrances", icon: FlaskConical },
  { id: "pm", label: "Packaging Materials (PM)", sub: "Bottles, Pumps, Droppers & Boxes", icon: Boxes },
  { id: "bulk", label: "Bulk Formulation (SFG)", sub: "Semi-Finished Compounded Bulk", icon: Layers },
  { id: "rd", label: "R&D / Trial Batches", sub: "Pilot Formulations & Lab Samples", icon: Sparkles },
]

// FG category fallback — used only while the Dictionaries-module entry is
// loading or if the fetch fails. Live options come from the "category"
// dictionary (Settings > Dictionaries) via /api/dermat_sales_flow/dictionaries/category,
// so admins can add new categories without a code change.
const FG_CATEGORY_FALLBACK_OPTIONS = [
  { value: "Serum", label: "Face Serum" },
  { value: "Sunscreen", label: "Sunscreen Gel / Lotion SPF" },
  { value: "Cream", label: "Face Cream / Moisturizer" },
  { value: "Face Wash", label: "Cleanser / Face Wash" },
  { value: "Gel", label: "Treatment Gel / Salicylic" },
  { value: "Lotion", label: "Body Lotion / Milk" },
  { value: "Toner", label: "Facial Toner / Mist" },
  { value: "Shampoo", label: "Hair Care / Shampoo / Conditioner" },
  { value: "Mask", label: "Face Mask / Peeling Solution" },
  { value: "Oil", label: "Face / Hair Oil" },
  { value: "Other", label: "Other / Custom Formulation" },
] as const

type DictionaryOption = { value: string; label: string }
type DictionaryEntryPayload = { value?: string; label?: string }
type DictionaryResponsePayload = { entries?: DictionaryEntryPayload[] }

function buildDictionaryOptions(
  entries: DictionaryEntryPayload[] | undefined,
  fallback: readonly DictionaryOption[],
): DictionaryOption[] {
  const list = Array.isArray(entries) ? entries : []
  const options = list
    .map((entry) => {
      const value = typeof entry.value === "string" ? entry.value.trim() : ""
      if (!value) return null
      return { value, label: (typeof entry.label === "string" && entry.label.trim()) || value }
    })
    .filter((entry): entry is DictionaryOption => Boolean(entry))
  return options.length > 0 ? options : [...fallback]
}

// RM Options
const RM_CLASSIFICATIONS = [
  { value: "Active", label: "Active Ingredient / Botanical Extract" },
  { value: "Surfactant", label: "Surfactant / Foaming Agent" },
  { value: "Emulsifier", label: "Emulsifier / Stabilizer" },
  { value: "Preservative", label: "Preservative / Broad Spectrum Antimicrobial" },
  { value: "Fragrance", label: "Fragrance / Essential Oil" },
  { value: "OilWax", label: "Natural Oil / Butter / Wax" },
  { value: "Thickener", label: "Thickener / Rheology Modifier / Polymer" },
  { value: "Solvent", label: "Solvent / Carrier / Glycol" },
  { value: "Acid", label: "Acid / Exfoliant (AHA / BHA / PHA)" },
  { value: "Other", label: "Other Chemical Compound" },
]

// PM Options
const PM_TYPES = [
  { value: "Bottle", label: "Primary Bottle / Container" },
  { value: "Pump", label: "Pump / Dispenser / Spray" },
  { value: "Dropper", label: "Pipette Dropper / Glass Cap" },
  { value: "Cap", label: "Cap / Screw Closure / Flip-Top" },
  { value: "Jar", label: "Jar / Acrylic Tub" },
  { value: "Tube", label: "Squeeze Tube / Laminated Tube" },
  { value: "Monocarton", label: "Monocarton / Outer Printed Unit Box" },
  { value: "Label", label: "Product Label / Front & Back Sticker" },
  { value: "Shipper", label: "Master Corrugated Shipper Box" },
  { value: "Liner", label: "Shrink Wrap / Induction Heat Seal Liner" },
]

const PM_MATERIALS = [
  { value: "Amber Glass", label: "Amber Glass" },
  { value: "Flint Glass", label: "Flint / Clear Glass" },
  { value: "PET", label: "PET Plastic" },
  { value: "HDPE", label: "HDPE Plastic" },
  { value: "PP", label: "Polypropylene (PP)" },
  { value: "Acrylic", label: "Acrylic / PMMA" },
  { value: "Paperboard", label: "Virgin Paperboard / SBS / Kraft" },
  { value: "Corrugated", label: "Corrugated 3-Ply / 5-Ply" },
  { value: "Aluminum", label: "Aluminum / Metallic" },
]

// Bulk Options
const BULK_FORMULATION_TYPES = [
  { value: "Emulsion", label: "Emulsion / Cream / Lotion" },
  { value: "Serum", label: "Serum / Aqueous Solution" },
  { value: "Gel", label: "Gel / Thickened Aqueous Base" },
  { value: "Cleanser", label: "Cleanser / Surfactant Solution" },
  { value: "Suspension", label: "Suspension / Clay Mask" },
  { value: "Anhydrous", label: "Anhydrous / Oil Blend / Balm" },
]

// RD Options
const RD_STAGES = [
  { value: "Lab Formulation", label: "Lab Formulation & Compounding" },
  { value: "Stability Testing", label: "Stability Testing (30-90 Days)" },
  { value: "Client Sample", label: "Client Sample Submission & Feedback" },
  { value: "Approved Commercial", label: "Approved for Commercial Production" },
]

const GST_OPTIONS = [
  { value: "18", label: "18% GST (Cosmetics / Chemical Standard)" },
  { value: "12", label: "12% GST (Ayurvedic / Derma / Paperboard)" },
  { value: "5", label: "5% GST (Essential Raw Materials)" },
  { value: "0", label: "0% GST (Exempt / Internal Trial)" },
]

const STORAGE_OPTIONS = [
  { value: "Room Temp (15-25°C)", label: "Room Temperature (15-25°C)" },
  { value: "Cool & Dry (2-8°C)", label: "Cool & Dry (2-8°C Refrigerated)" },
  { value: "Amber / Dark Protection", label: "Protect from Direct Light / Amber Storage" },
  { value: "Moisture Sensitive / Air-tight", label: "Air-tight / Hygroscopic (Moisture Sensitive)" },
]

const SHELF_LIFE_OPTIONS = [
  "24 Months",
  "36 Months",
  "18 Months",
  "12 Months",
  "6 Months",
]

export default function CreateCatalogProductPage() {
  const t = useT()
  const router = useRouter()
  const searchParams = useSearchParams()
  const returnTo = searchParams.get("returnTo")
  const { organizationId, tenantId } = useOrganizationScopeDetail()

  // Master Category Tab
  const [invCategory, setInvCategory] = React.useState<InventoryCategory>("fg")

  // Cosmetic category options — Dictionaries-module-backed (Settings > Dictionaries
  // > "category") so admins can add new categories without a code change. Falls
  // back to the shipped defaults while loading or if the fetch fails.
  const [categoryOptions, setCategoryOptions] = React.useState<DictionaryOption[]>([...FG_CATEGORY_FALLBACK_OPTIONS])
  React.useEffect(() => {
    let cancelled = false
    async function loadCategoryDictionary() {
      const res = await apiCall<DictionaryResponsePayload>(
        "/api/dermat_sales_flow/dictionaries/category",
        undefined,
        { fallback: { entries: [] } },
      )
      if (cancelled) return
      setCategoryOptions(buildDictionaryOptions(res.result?.entries, FG_CATEGORY_FALLBACK_OPTIONS))
    }
    void loadCategoryDictionary()
    return () => {
      cancelled = true
    }
  }, [])

  // Common Fields
  const [title, setTitle] = React.useState("")
  const [sku, setSku] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [submitting, setSubmitting] = React.useState(false)

  // 1. Finished Goods (FG) Specific
  const [fgCategory, setFgCategory] = React.useState("Serum")
  const [clientBrand, setClientBrand] = React.useState("")
  const [fgPackSize, setFgPackSize] = React.useState("50")
  const [fgUom, setFgUom] = React.useState("ml")
  const [fgMrp, setFgMrp] = React.useState("599")
  const [fgRate, setFgRate] = React.useState("180")
  const [fgGst, setFgGst] = React.useState("18")
  const [fgShelfLife, setFgShelfLife] = React.useState("24 Months")
  const [fgMoq, setFgMoq] = React.useState("500")

  // 2. Raw Materials (RM) Specific
  const [rmClassification, setRmClassification] = React.useState("Active")
  const [rmGrade, setRmGrade] = React.useState("Cosmetic Grade USP")
  const [rmUom, setRmUom] = React.useState("kg")
  const [rmPurchaseRate, setRmPurchaseRate] = React.useState("1450")
  const [rmReorderLevel, setRmReorderLevel] = React.useState("25")
  const [rmGst, setRmGst] = React.useState("18")
  const [rmStorage, setRmStorage] = React.useState("Cool & Dry (2-8°C)")
  const [rmRetestPeriod, setRmRetestPeriod] = React.useState("24 Months")
  const [rmLeadTimeDays, setRmLeadTimeDays] = React.useState("7")

  // 3. Packaging Materials (PM) Specific
  const [pmType, setPmType] = React.useState("Bottle")
  const [pmMaterial, setPmMaterial] = React.useState("Amber Glass")
  const [pmVolume, setPmVolume] = React.useState("30 ml")
  const [pmNeckSize, setPmNeckSize] = React.useState("18/415")
  const [pmUom, setPmUom] = React.useState("pcs")
  const [pmCostRate, setPmCostRate] = React.useState("14.50")
  const [pmMoq, setPmMoq] = React.useState("2500")
  const [pmGst, setPmGst] = React.useState("18")
  const [pmLeadTimeDays, setPmLeadTimeDays] = React.useState("14")

  // 4. Bulk Formulation (SFG) Specific
  const [bulkMatrix, setBulkMatrix] = React.useState("Serum")
  const [bulkBatchSize, setBulkBatchSize] = React.useState("100")
  const [bulkUom, setBulkUom] = React.useState("kg")
  const [bulkCostRate, setBulkCostRate] = React.useState("380")
  const [bulkGst, setBulkGst] = React.useState("18")
  const [bulkTargetPh, setBulkTargetPh] = React.useState("5.5 - 6.0")
  const [bulkViscosity, setBulkViscosity] = React.useState("12,000 - 15,000 cps")
  const [bulkShelfLife, setBulkShelfLife] = React.useState("12 Months")

  // 5. R&D / Trial Specific
  const [rdTargetCategory, setRdTargetCategory] = React.useState("Serum")
  const [rdStage, setRdStage] = React.useState("Lab Formulation")
  const [rdSampleSize, setRdSampleSize] = React.useState("100")
  const [rdSampleUom, setRdSampleUom] = React.useState("gm")
  const [rdClientProspect, setRdClientProspect] = React.useState("")
  const [rdLabCost, setRdLabCost] = React.useState("500")

  // Auto-fill SKU generator helper based on current category
  const handleAutoGenerateSku = React.useCallback(() => {
    const random = Math.floor(100 + Math.random() * 900)
    if (invCategory === "fg") {
      const brandPrefix = clientBrand ? clientBrand.slice(0, 3).toUpperCase() : "DER"
      const catPrefix = fgCategory.slice(0, 3).toUpperCase()
      const size = fgPackSize || "50"
      setSku(`FG-${brandPrefix}-${catPrefix}-${size}-${random}`)
    } else if (invCategory === "rm") {
      const classPrefix = rmClassification.slice(0, 3).toUpperCase()
      const namePart = (title || "MAT").slice(0, 3).toUpperCase().replace(/[^A-Z]/g, "X")
      setSku(`RM-${classPrefix}-${namePart}-${random}`)
    } else if (invCategory === "pm") {
      const typePrefix = pmType.slice(0, 3).toUpperCase()
      const sizePart = (pmVolume || "30").replace(/[^0-9]/g, "") || "30"
      setSku(`PM-${typePrefix}-${sizePart}-${random}`)
    } else if (invCategory === "bulk") {
      const matrixPrefix = bulkMatrix.slice(0, 3).toUpperCase()
      setSku(`SFG-${matrixPrefix}-${bulkBatchSize}KG-${random}`)
    } else if (invCategory === "rd") {
      setSku(`RD-TRIAL-${random}`)
    }
  }, [
    invCategory,
    clientBrand,
    fgCategory,
    fgPackSize,
    rmClassification,
    title,
    pmType,
    pmVolume,
    bulkMatrix,
    bulkBatchSize,
  ])

  // Calculations for live preview
  // FG preview
  const numFgMrp = Number(fgMrp) || 0
  const numFgRate = Number(fgRate) || 0
  const numFgMoq = Number(fgMoq) || 500
  const fgMarginPercent = numFgMrp > 0 && numFgRate > 0 ? Math.round(((numFgMrp - numFgRate) / numFgMrp) * 100) : 0
  const fgMoqBatchTaxable = numFgMoq * numFgRate
  const fgMoqBatchTax = Math.round((fgMoqBatchTaxable * (Number(fgGst) || 18)) / 100)
  const fgMoqBatchTotal = fgMoqBatchTaxable + fgMoqBatchTax

  // RM preview
  const numRmRate = Number(rmPurchaseRate) || 0
  const numRmReorder = Number(rmReorderLevel) || 0
  const rmMinStockValue = numRmRate * numRmReorder
  const rmMinStockTax = Math.round((rmMinStockValue * (Number(rmGst) || 18)) / 100)

  // PM preview
  const numPmRate = Number(pmCostRate) || 0
  const numPmMoq = Number(pmMoq) || 0
  const pmMoqBatchTaxable = numPmRate * numPmMoq
  const pmMoqBatchTax = Math.round((pmMoqBatchTaxable * (Number(pmGst) || 18)) / 100)
  const pmMoqBatchTotal = pmMoqBatchTaxable + pmMoqBatchTax

  // Bulk preview
  const numBulkBatch = Number(bulkBatchSize) || 100
  const numBulkRate = Number(bulkCostRate) || 0
  const bulkTotalBatchValue = numBulkBatch * numBulkRate

  // Save product
  const handleSubmit = React.useCallback(
    async (e?: React.FormEvent) => {
      if (e) e.preventDefault()
      if (!title.trim()) {
        flash("Item name / formulation title is required", "error")
        return
      }

      setSubmitting(true)
      try {
        let baseUom = "pcs"
        let rateStr = "0"
        let mrpStr = "0"
        let categoryName = ""
        let defaultVariantWeight = 1
        let customMetadata: Record<string, unknown> = {
          inventory_category: invCategory,
        }

        if (invCategory === "fg") {
          baseUom = fgUom
          rateStr = fgRate.trim()
          mrpStr = fgMrp.trim()
          categoryName = fgCategory
          defaultVariantWeight = Number(fgPackSize) || 50
          customMetadata = {
            ...customMetadata,
            client_brand: clientBrand.trim() || "Dermat India",
            product_code: sku.trim(),
            category: fgCategory,
            product_nature: "fg",
            base_uom: fgUom,
            pack_size: fgPackSize.trim(),
            mrp: fgMrp.trim(),
            rate: fgRate.trim(),
            gst_percent: fgGst,
            shelf_life: fgShelfLife,
            min_floor_qty: numFgMoq,
          }
        } else if (invCategory === "rm") {
          baseUom = rmUom
          rateStr = rmPurchaseRate.trim()
          categoryName = `RM - ${rmClassification}`
          defaultVariantWeight = 1
          customMetadata = {
            ...customMetadata,
            material_code: sku.trim(),
            rm_classification: rmClassification,
            chemical_grade: rmGrade.trim(),
            purchase_uom: rmUom,
            purchase_rate: rmPurchaseRate.trim(),
            reorder_level: rmReorderLevel.trim(),
            gst_percent: rmGst,
            storage_condition: rmStorage,
            retest_period: rmRetestPeriod,
            lead_time_days: rmLeadTimeDays.trim(),
          }
        } else if (invCategory === "pm") {
          baseUom = pmUom
          rateStr = pmCostRate.trim()
          categoryName = `PM - ${pmType}`
          defaultVariantWeight = 1
          customMetadata = {
            ...customMetadata,
            material_code: sku.trim(),
            pm_type: pmType,
            pm_material: pmMaterial,
            compatible_volume: pmVolume.trim(),
            neck_size: pmNeckSize.trim(),
            base_uom: pmUom,
            unit_cost: pmCostRate.trim(),
            moq_qty: pmMoq.trim(),
            gst_percent: pmGst,
            lead_time_days: pmLeadTimeDays.trim(),
          }
        } else if (invCategory === "bulk") {
          baseUom = bulkUom
          rateStr = bulkCostRate.trim()
          categoryName = `SFG Bulk - ${bulkMatrix}`
          defaultVariantWeight = Number(bulkBatchSize) || 100
          customMetadata = {
            ...customMetadata,
            bulk_code: sku.trim(),
            bulk_matrix: bulkMatrix,
            standard_batch_size: bulkBatchSize.trim(),
            bulk_uom: bulkUom,
            cost_rate: bulkCostRate.trim(),
            gst_percent: bulkGst,
            target_ph: bulkTargetPh.trim(),
            viscosity: bulkViscosity.trim(),
            shelf_life: bulkShelfLife,
          }
        } else if (invCategory === "rd") {
          baseUom = rdSampleUom
          rateStr = rdLabCost.trim()
          categoryName = `R&D Trial - ${rdTargetCategory}`
          defaultVariantWeight = Number(rdSampleSize) || 100
          customMetadata = {
            ...customMetadata,
            trial_code: sku.trim(),
            rd_stage: rdStage,
            sample_size: rdSampleSize.trim(),
            sample_uom: rdSampleUom,
            prospect_brand: rdClientProspect.trim(),
            lab_cost: rdLabCost.trim(),
          }
        }

        // 1. Create Product
        const productPayload = {
          organizationId,
          tenantId,
          title: title.trim(),
          sku: sku.trim() || undefined,
          description: description.trim() || undefined,
          isActive: true,
          productType: "simple",
          defaultUnit: baseUom,
          hsCode: "33049900", // Standard cosmetics/chemistry HS code stored silently
          metadata: customMetadata,
          customFields: {
            ...customMetadata,
            title: title.trim(),
            sku: sku.trim() || undefined,
            category: categoryName,
            // Clean enum driving the fieldset-follows-category mechanism and
            // the 4 category page filters (Raw Material / Packing Material /
            // Finished Goods / Bulk) — kept separate from `category` above,
            // which stays a rich display label. R&D has no matching
            // fieldset/category-group value; it intentionally falls through
            // to the always-shown backbone fields only.
            product_category_group: INVENTORY_CATEGORY_TO_FIELDSET[invCategory],
          },
        }

        const prodRes = await createCrud<{ id: string }>("catalog/products", productPayload)
        const newProductId = prodRes.result?.id

        if (!newProductId) {
          throw new Error("Product created, but ID was not returned by server.")
        }

        // 2. Create Default Standard Variant (no multi-pack variations required)
        const defaultVariantPayload = {
          organizationId,
          tenantId,
          productId: newProductId,
          name: "Standard",
          sku: sku.trim() || `${newProductId.slice(0, 8)}-STD`,
          isActive: true,
          isDefault: true,
          weightValue: defaultVariantWeight,
          weightUnit: baseUom,
          metadata: {
            rate: rateStr,
            mrp: mrpStr,
            uom: baseUom,
            ...customMetadata,
          },
          customFields: {
            rate: Number(rateStr) || undefined,
            mrp: Number(mrpStr) || undefined,
            uom: baseUom,
          },
        }

        await createCrud("catalog/variants", defaultVariantPayload)

        flash(`Item "${title}" successfully saved to inventory catalog!`, "success")
        if (returnTo) {
          router.push(returnTo)
        } else {
          router.push(`/backend/catalog/products/${newProductId}`)
        }
      } catch (err) {
        flash(err instanceof Error ? err.message : "Failed to create inventory item", "error")
      } finally {
        setSubmitting(false)
      }
    },
    [
      title,
      sku,
      description,
      invCategory,
      organizationId,
      tenantId,
      // FG
      fgCategory,
      clientBrand,
      fgPackSize,
      fgUom,
      fgMrp,
      fgRate,
      fgGst,
      fgShelfLife,
      numFgMoq,
      // RM
      rmClassification,
      rmGrade,
      rmUom,
      rmPurchaseRate,
      rmReorderLevel,
      rmGst,
      rmStorage,
      rmRetestPeriod,
      rmLeadTimeDays,
      // PM
      pmType,
      pmMaterial,
      pmVolume,
      pmNeckSize,
      pmUom,
      pmCostRate,
      pmMoq,
      pmGst,
      pmLeadTimeDays,
      // Bulk
      bulkMatrix,
      bulkBatchSize,
      bulkUom,
      bulkCostRate,
      bulkGst,
      bulkTargetPh,
      bulkViscosity,
      bulkShelfLife,
      // RD
      rdTargetCategory,
      rdStage,
      rdSampleSize,
      rdSampleUom,
      rdClientProspect,
      rdLabCost,
      returnTo,
      router,
    ]
  )

  return (
    <Page>
      <PageBody>
        <div className="space-y-6 max-w-6xl mx-auto pb-16">
          {/* Header */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b pb-4">
            <div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground mr-1"
                  onClick={() => {
                    if (returnTo) router.push(returnTo)
                    else router.push("/backend/catalog/products")
                  }}
                  title="Back"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <Warehouse className="h-6 w-6 text-primary" />
                <h1 className="text-2xl font-bold tracking-tight">Add Master Inventory Item</h1>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 ml-11">
                Unified master entry for Finished Goods, Raw Materials, Packaging, Bulk Formulations, and R&D Trials
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  if (returnTo) router.push(returnTo)
                  else router.push("/backend/catalog/products")
                }}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleSubmit}
                disabled={submitting || !title.trim()}
                className="px-6 font-semibold"
              >
                {submitting ? "Saving Item..." : "Save Master Item"}
              </Button>
            </div>
          </div>

          {/* Top Category Tabs Selector */}
          <div className="rounded-xl border bg-muted/30 p-1.5 shadow-sm">
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
              {CATEGORY_TABS.map((tab) => {
                const Icon = tab.icon
                const isSelected = invCategory === tab.id
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => {
                      setInvCategory(tab.id)
                      // Clear SKU or regenerate if empty
                      if (!sku || sku.includes("-")) {
                        // let user trigger or leave blank
                      }
                    }}
                    className={`flex flex-col items-center sm:items-start text-left p-3 rounded-lg transition-all ${
                      isSelected
                        ? "bg-background text-primary shadow-sm border border-primary/20 font-semibold ring-1 ring-primary/20"
                        : "text-muted-foreground hover:bg-background/50 hover:text-foreground border border-transparent"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Icon className={`h-4 w-4 ${isSelected ? "text-primary" : "text-muted-foreground"}`} />
                      <span className="text-xs font-bold leading-none">{tab.label}</span>
                    </div>
                    <span className="text-[10px] text-muted-foreground hidden sm:inline-block leading-tight">
                      {tab.sub}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Left Column: Form Cards (8 cols) */}
              <div className="lg:col-span-8 space-y-6">

                {/* 1. CATEGORY: FINISHED GOODS (FG) */}
                {invCategory === "fg" && (
                  <>
                    {/* FG Card 1: Identity */}
                    <Card>
                      <CardHeader className="pb-3 border-b bg-muted/20">
                        <CardTitle className="text-sm font-bold flex items-center gap-2">
                          <Package className="h-4 w-4 text-primary" />
                          1. Finished Good Identity & Brand
                        </CardTitle>
                        <CardDescription className="text-xs">
                          Finished skincare / cosmetic product formulation and code
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="pt-4 space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                          <div className="sm:col-span-8 space-y-1.5">
                            <Label className="text-xs font-medium">Product / Formulation Name *</Label>
                            <Input
                              value={title}
                              onChange={(e) => setTitle(e.target.value)}
                              placeholder="e.g. Niacinamide 10% + Zinc 1% Clarifying Serum"
                              className="h-9 text-xs font-medium"
                              required
                            />
                          </div>
                          <div className="sm:col-span-4 space-y-1.5">
                            <div className="flex items-center justify-between">
                              <Label className="text-xs font-medium">Product Code / SKU</Label>
                              <button
                                type="button"
                                onClick={handleAutoGenerateSku}
                                className="text-[10px] text-primary hover:underline font-medium"
                              >
                                Auto-Gen
                              </button>
                            </div>
                            <Input
                              value={sku}
                              onChange={(e) => setSku(e.target.value)}
                              placeholder="e.g. FG-DER-SER-50"
                              className="h-9 text-xs font-mono"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <Label className="text-xs font-medium">Cosmetic Category</Label>
                            <Select value={fgCategory} onValueChange={setFgCategory}>
                              <SelectTrigger className="h-9 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {categoryOptions.map((opt) => (
                                  <SelectItem key={opt.value} value={opt.value} className="text-xs">
                                    {opt.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs font-medium">Brand Name (Optional)</Label>
                            <Input
                              value={clientBrand}
                              onChange={(e) => setClientBrand(e.target.value)}
                              placeholder="e.g. Dermat India, Skin Theta"
                              className="h-9 text-xs"
                            />
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {/* FG Card 2: Pack Size & Pricing */}
                    <Card>
                      <CardHeader className="pb-3 border-b bg-muted/20">
                        <CardTitle className="text-sm font-bold flex items-center gap-2">
                          <DollarSign className="h-4 w-4 text-primary" />
                          2. Pack Size & Commercial Pricing
                        </CardTitle>
                        <CardDescription className="text-xs">
                          Finished container volume, printed retail MRP, and manufacturing billing rate
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="pt-4 space-y-4">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                          <div className="space-y-1.5">
                            <Label className="text-xs font-medium">Pack Size *</Label>
                            <Input
                              value={fgPackSize}
                              onChange={(e) => setFgPackSize(e.target.value)}
                              placeholder="50"
                              className="h-9 text-xs font-mono font-bold"
                              required
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs font-medium">Unit (UOM)</Label>
                            <Select value={fgUom} onValueChange={setFgUom}>
                              <SelectTrigger className="h-9 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="ml" className="text-xs">ml (Milliliters)</SelectItem>
                                <SelectItem value="gm" className="text-xs">gm (Grams)</SelectItem>
                                <SelectItem value="pcs" className="text-xs">pcs (Pieces)</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs font-medium">Printed MRP (₹)</Label>
                            <Input
                              value={fgMrp}
                              onChange={(e) => setFgMrp(e.target.value)}
                              placeholder="599"
                              className="h-9 text-xs font-mono"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs font-medium">Contract Rate (₹/unit) *</Label>
                            <Input
                              value={fgRate}
                              onChange={(e) => setFgRate(e.target.value)}
                              placeholder="180"
                              className="h-9 text-xs font-mono font-bold text-primary"
                              required
                            />
                          </div>
                        </div>

                        <div className="rounded-md border bg-muted/30 px-3.5 py-2.5 flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2">
                            <Info className="h-4 w-4 text-muted-foreground" />
                            <span className="text-muted-foreground">
                              Retail Markup: <strong>₹{numFgMrp > numFgRate ? numFgMrp - numFgRate : 0} / unit</strong>
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-muted-foreground">Brand Margin:</span>
                            <span className="rounded bg-primary/10 text-primary font-bold px-2 py-0.5 text-xs font-mono">
                              {fgMarginPercent}%
                            </span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {/* FG Card 3: GST & Shelf Life */}
                    <Card>
                      <CardHeader className="pb-3 border-b bg-muted/20">
                        <CardTitle className="text-sm font-bold flex items-center gap-2">
                          <ShieldCheck className="h-4 w-4 text-primary" />
                          3. GST & Production Batch Parameters
                        </CardTitle>
                        <CardDescription className="text-xs">
                          Tax rate, shelf life stability, and minimum production floor
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="pt-4 space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div className="space-y-1.5">
                            <Label className="text-xs font-medium">GST Tax Rate</Label>
                            <Select value={fgGst} onValueChange={setFgGst}>
                              <SelectTrigger className="h-9 text-xs font-medium">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {GST_OPTIONS.map((g) => (
                                  <SelectItem key={g.value} value={g.value} className="text-xs">
                                    {g.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs font-medium">Shelf Life</Label>
                            <Select value={fgShelfLife} onValueChange={setFgShelfLife}>
                              <SelectTrigger className="h-9 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {SHELF_LIFE_OPTIONS.map((sl) => (
                                  <SelectItem key={sl} value={sl} className="text-xs">
                                    {sl}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs font-medium">Min Batch / MOQ (Units)</Label>
                            <Input
                              type="number"
                              min={1}
                              value={fgMoq}
                              onChange={(e) => setFgMoq(e.target.value)}
                              placeholder="500"
                              className="h-9 text-xs font-mono font-semibold"
                            />
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {/* FG Card 4: Formulation Notes */}
                    <Card>
                      <CardHeader className="pb-3 border-b bg-muted/20">
                        <CardTitle className="text-sm font-bold flex items-center gap-2">
                          <Layers className="h-4 w-4 text-primary" />
                          4. Formulation Actives & Packaging Notes
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="pt-4">
                        <Textarea
                          value={description}
                          onChange={(e) => setDescription(e.target.value)}
                          placeholder="e.g. Key Actives: Niacinamide 10%, Zinc PCA 1%, Hyaluronic Acid 0.5%. Target pH: 5.5 - 6.0. Glass dropper bottle with tamper-evident seal."
                          rows={3}
                          className="text-xs leading-relaxed"
                        />
                      </CardContent>
                    </Card>
                  </>
                )}

                {/* 2. CATEGORY: RAW MATERIALS (RM) */}
                {invCategory === "rm" && (
                  <>
                    {/* RM Card 1: Identity */}
                    <Card>
                      <CardHeader className="pb-3 border-b bg-muted/20">
                        <CardTitle className="text-sm font-bold flex items-center gap-2">
                          <FlaskConical className="h-4 w-4 text-primary" />
                          1. Raw Material / Chemical Identity
                        </CardTitle>
                        <CardDescription className="text-xs">
                          Active ingredients, chemical compounds, extracts, surfactants, and oils
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="pt-4 space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                          <div className="sm:col-span-8 space-y-1.5">
                            <Label className="text-xs font-medium">Material / Chemical Name *</Label>
                            <Input
                              value={title}
                              onChange={(e) => setTitle(e.target.value)}
                              placeholder="e.g. Sodium Silicate / Niacinamide PC (USP) / Hyaluronic Acid Powder"
                              className="h-9 text-xs font-medium"
                              required
                            />
                          </div>
                          <div className="sm:col-span-4 space-y-1.5">
                            <div className="flex items-center justify-between">
                              <Label className="text-xs font-medium">Material Code / SKU</Label>
                              <button
                                type="button"
                                onClick={handleAutoGenerateSku}
                                className="text-[10px] text-primary hover:underline font-medium"
                              >
                                Auto-Gen
                              </button>
                            </div>
                            <Input
                              value={sku}
                              onChange={(e) => setSku(e.target.value)}
                              placeholder="e.g. RM-ACT-NIA-01"
                              className="h-9 text-xs font-mono"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <Label className="text-xs font-medium">Chemical Classification</Label>
                            <Select value={rmClassification} onValueChange={setRmClassification}>
                              <SelectTrigger className="h-9 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {RM_CLASSIFICATIONS.map((c) => (
                                  <SelectItem key={c.value} value={c.value} className="text-xs">
                                    {c.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs font-medium">Grade / CAS No. (Optional)</Label>
                            <Input
                              value={rmGrade}
                              onChange={(e) => setRmGrade(e.target.value)}
                              placeholder="e.g. Cosmetic Grade USP / CAS: 98-92-0"
                              className="h-9 text-xs"
                            />
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {/* RM Card 2: Procurement & Inventory Stocking */}
                    <Card>
                      <CardHeader className="pb-3 border-b bg-muted/20">
                        <CardTitle className="text-sm font-bold flex items-center gap-2">
                          <DollarSign className="h-4 w-4 text-primary" />
                          2. Procurement Rate & Stock Thresholds
                        </CardTitle>
                        <CardDescription className="text-xs">
                          Unit purchase rate, inventory reorder level, and tax
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="pt-4 space-y-4">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                          <div className="space-y-1.5">
                            <Label className="text-xs font-medium">Purchase Unit (UOM)</Label>
                            <Select value={rmUom} onValueChange={setRmUom}>
                              <SelectTrigger className="h-9 text-xs font-bold">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="kg" className="text-xs">kg (Kilograms)</SelectItem>
                                <SelectItem value="gm" className="text-xs">gm (Grams)</SelectItem>
                                <SelectItem value="l" className="text-xs">L (Liters)</SelectItem>
                                <SelectItem value="ml" className="text-xs">ml (Milliliters)</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs font-medium">Purchase Rate (₹/{rmUom}) *</Label>
                            <Input
                              value={rmPurchaseRate}
                              onChange={(e) => setRmPurchaseRate(e.target.value)}
                              placeholder="1450"
                              className="h-9 text-xs font-mono font-bold text-primary"
                              required
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs font-medium">Reorder Level ({rmUom})</Label>
                            <Input
                              value={rmReorderLevel}
                              onChange={(e) => setRmReorderLevel(e.target.value)}
                              placeholder="25"
                              className="h-9 text-xs font-mono font-semibold"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs font-medium">GST Tax Rate</Label>
                            <Select value={rmGst} onValueChange={setRmGst}>
                              <SelectTrigger className="h-9 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {GST_OPTIONS.map((g) => (
                                  <SelectItem key={g.value} value={g.value} className="text-xs">
                                    {g.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {/* RM Card 3: Storage & Safety */}
                    <Card>
                      <CardHeader className="pb-3 border-b bg-muted/20">
                        <CardTitle className="text-sm font-bold flex items-center gap-2">
                          <Warehouse className="h-4 w-4 text-primary" />
                          3. Storage Conditions & Quality Retest
                        </CardTitle>
                        <CardDescription className="text-xs">
                          Warehouse storage requirements, shelf stability, and procurement lead time
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="pt-4 space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div className="space-y-1.5">
                            <Label className="text-xs font-medium">Storage Condition</Label>
                            <Select value={rmStorage} onValueChange={setRmStorage}>
                              <SelectTrigger className="h-9 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {STORAGE_OPTIONS.map((s) => (
                                  <SelectItem key={s.value} value={s.value} className="text-xs">
                                    {s.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs font-medium">Retest / Shelf Life</Label>
                            <Select value={rmRetestPeriod} onValueChange={setRmRetestPeriod}>
                              <SelectTrigger className="h-9 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {SHELF_LIFE_OPTIONS.map((sl) => (
                                  <SelectItem key={sl} value={sl} className="text-xs">
                                    {sl}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs font-medium">Lead Time (Days)</Label>
                            <Input
                              type="number"
                              value={rmLeadTimeDays}
                              onChange={(e) => setRmLeadTimeDays(e.target.value)}
                              placeholder="7"
                              className="h-9 text-xs font-mono"
                            />
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {/* RM Card 4: Supplier Notes */}
                    <Card>
                      <CardHeader className="pb-3 border-b bg-muted/20">
                        <CardTitle className="text-sm font-bold flex items-center gap-2">
                          <Info className="h-4 w-4 text-primary" />
                          4. Supplier & COA Specification Notes
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="pt-4">
                        <Textarea
                          value={description}
                          onChange={(e) => setDescription(e.target.value)}
                          placeholder="e.g. Approved Suppliers: BASF, Clariant, Croda. COA and microbial testing mandatory with each incoming shipment lot."
                          rows={3}
                          className="text-xs leading-relaxed"
                        />
                      </CardContent>
                    </Card>
                  </>
                )}

                {/* 3. CATEGORY: PACKAGING MATERIALS (PM) */}
                {invCategory === "pm" && (
                  <>
                    {/* PM Card 1: Identity */}
                    <Card>
                      <CardHeader className="pb-3 border-b bg-muted/20">
                        <CardTitle className="text-sm font-bold flex items-center gap-2">
                          <Boxes className="h-4 w-4 text-primary" />
                          1. Packaging Material Identity
                        </CardTitle>
                        <CardDescription className="text-xs">
                          Primary containers, droppers, pumps, caps, monocartons, and labels
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="pt-4 space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                          <div className="sm:col-span-8 space-y-1.5">
                            <Label className="text-xs font-medium">Packaging Item Name *</Label>
                            <Input
                              value={title}
                              onChange={(e) => setTitle(e.target.value)}
                              placeholder="e.g. 30ml Amber Glass Dropper Bottle (18/415) / Outer Monocarton"
                              className="h-9 text-xs font-medium"
                              required
                            />
                          </div>
                          <div className="sm:col-span-4 space-y-1.5">
                            <div className="flex items-center justify-between">
                              <Label className="text-xs font-medium">Material Code / SKU</Label>
                              <button
                                type="button"
                                onClick={handleAutoGenerateSku}
                                className="text-[10px] text-primary hover:underline font-medium"
                              >
                                Auto-Gen
                              </button>
                            </div>
                            <Input
                              value={sku}
                              onChange={(e) => setSku(e.target.value)}
                              placeholder="e.g. PM-BOT-30-AMB"
                              className="h-9 text-xs font-mono"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <Label className="text-xs font-medium">Packaging Type</Label>
                            <Select value={pmType} onValueChange={setPmType}>
                              <SelectTrigger className="h-9 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {PM_TYPES.map((t) => (
                                  <SelectItem key={t.value} value={t.value} className="text-xs">
                                    {t.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs font-medium">Material Construction</Label>
                            <Select value={pmMaterial} onValueChange={setPmMaterial}>
                              <SelectTrigger className="h-9 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {PM_MATERIALS.map((m) => (
                                  <SelectItem key={m.value} value={m.value} className="text-xs">
                                    {m.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {/* PM Card 2: Dimensions & Compatibility */}
                    <Card>
                      <CardHeader className="pb-3 border-b bg-muted/20">
                        <CardTitle className="text-sm font-bold flex items-center gap-2">
                          <Info className="h-4 w-4 text-primary" />
                          2. Technical Dimensions & Compatibility
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="pt-4 space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div className="space-y-1.5">
                            <Label className="text-xs font-medium">Compatible Volume / Size</Label>
                            <Input
                              value={pmVolume}
                              onChange={(e) => setPmVolume(e.target.value)}
                              placeholder="e.g. 30 ml / 50 ml"
                              className="h-9 text-xs"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs font-medium">Neck / Closure Thread</Label>
                            <Input
                              value={pmNeckSize}
                              onChange={(e) => setPmNeckSize(e.target.value)}
                              placeholder="e.g. 18/415 / 20/410 / N/A"
                              className="h-9 text-xs"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs font-medium">Base Inventory Unit</Label>
                            <Select value={pmUom} onValueChange={setPmUom}>
                              <SelectTrigger className="h-9 text-xs font-bold">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="pcs" className="text-xs">pcs (Pieces)</SelectItem>
                                <SelectItem value="nos" className="text-xs">nos (Numbers)</SelectItem>
                                <SelectItem value="sets" className="text-xs">sets (Sets)</SelectItem>
                                <SelectItem value="rolls" className="text-xs">rolls (Rolls / Labels)</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {/* PM Card 3: Procurement & MOQ */}
                    <Card>
                      <CardHeader className="pb-3 border-b bg-muted/20">
                        <CardTitle className="text-sm font-bold flex items-center gap-2">
                          <DollarSign className="h-4 w-4 text-primary" />
                          3. Procurement Cost & Supplier MOQ
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="pt-4 space-y-4">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                          <div className="space-y-1.5">
                            <Label className="text-xs font-medium">Unit Cost (₹/{pmUom}) *</Label>
                            <Input
                              value={pmCostRate}
                              onChange={(e) => setPmCostRate(e.target.value)}
                              placeholder="14.50"
                              className="h-9 text-xs font-mono font-bold text-primary"
                              required
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs font-medium">Supplier MOQ (Pcs)</Label>
                            <Input
                              value={pmMoq}
                              onChange={(e) => setPmMoq(e.target.value)}
                              placeholder="2500"
                              className="h-9 text-xs font-mono font-semibold"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs font-medium">GST Tax Rate</Label>
                            <Select value={pmGst} onValueChange={setPmGst}>
                              <SelectTrigger className="h-9 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {GST_OPTIONS.map((g) => (
                                  <SelectItem key={g.value} value={g.value} className="text-xs">
                                    {g.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs font-medium">Lead Time (Days)</Label>
                            <Input
                              type="number"
                              value={pmLeadTimeDays}
                              onChange={(e) => setPmLeadTimeDays(e.target.value)}
                              placeholder="14"
                              className="h-9 text-xs font-mono"
                            />
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {/* PM Card 4: Decoration Notes */}
                    <Card>
                      <CardHeader className="pb-3 border-b bg-muted/20">
                        <CardTitle className="text-sm font-bold flex items-center gap-2">
                          <Layers className="h-4 w-4 text-primary" />
                          4. Printing, Decoration & Tooling Notes
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="pt-4">
                        <Textarea
                          value={description}
                          onChange={(e) => setDescription(e.target.value)}
                          placeholder="e.g. Silk-screen printing with gold foil hot-stamping. Matte UV outer varnish. Pipette with graduated markings at 0.5ml and 1.0ml."
                          rows={3}
                          className="text-xs leading-relaxed"
                        />
                      </CardContent>
                    </Card>
                  </>
                )}

                {/* 4. CATEGORY: BULK FORMULATION (SFG) */}
                {invCategory === "bulk" && (
                  <>
                    {/* Bulk Card 1: Identity */}
                    <Card>
                      <CardHeader className="pb-3 border-b bg-muted/20">
                        <CardTitle className="text-sm font-bold flex items-center gap-2">
                          <Layers className="h-4 w-4 text-primary" />
                          1. Bulk Formulation Identity
                        </CardTitle>
                        <CardDescription className="text-xs">
                          Semi-finished compounded bulk liquid, cream, or serum prior to filling
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="pt-4 space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                          <div className="sm:col-span-8 space-y-1.5">
                            <Label className="text-xs font-medium">Bulk Formulation Title *</Label>
                            <Input
                              value={title}
                              onChange={(e) => setTitle(e.target.value)}
                              placeholder="e.g. RD609-01 HA & Watermelon Capsule Cream Bulk / Niacinamide Serum Base"
                              className="h-9 text-xs font-medium"
                              required
                            />
                          </div>
                          <div className="sm:col-span-4 space-y-1.5">
                            <div className="flex items-center justify-between">
                              <Label className="text-xs font-medium">Bulk Code / Batch ID</Label>
                              <button
                                type="button"
                                onClick={handleAutoGenerateSku}
                                className="text-[10px] text-primary hover:underline font-medium"
                              >
                                Auto-Gen
                              </button>
                            </div>
                            <Input
                              value={sku}
                              onChange={(e) => setSku(e.target.value)}
                              placeholder="e.g. SFG-RD609-01"
                              className="h-9 text-xs font-mono"
                            />
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <Label className="text-xs font-medium">Formulation Matrix</Label>
                          <Select value={bulkMatrix} onValueChange={setBulkMatrix}>
                            <SelectTrigger className="h-9 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {BULK_FORMULATION_TYPES.map((f) => (
                                <SelectItem key={f.value} value={f.value} className="text-xs">
                                  {f.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Bulk Card 2: Compounding Sizing & Costing */}
                    <Card>
                      <CardHeader className="pb-3 border-b bg-muted/20">
                        <CardTitle className="text-sm font-bold flex items-center gap-2">
                          <DollarSign className="h-4 w-4 text-primary" />
                          2. Compounding Batch Sizing & Cost Rate
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="pt-4 space-y-4">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                          <div className="space-y-1.5">
                            <Label className="text-xs font-medium">Compounding Size *</Label>
                            <Input
                              value={bulkBatchSize}
                              onChange={(e) => setBulkBatchSize(e.target.value)}
                              placeholder="100"
                              className="h-9 text-xs font-mono font-bold"
                              required
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs font-medium">Bulk Unit</Label>
                            <Select value={bulkUom} onValueChange={setBulkUom}>
                              <SelectTrigger className="h-9 text-xs font-bold">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="kg" className="text-xs">kg (Kilograms)</SelectItem>
                                <SelectItem value="l" className="text-xs">L (Liters)</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs font-medium">Cost Rate (₹/{bulkUom}) *</Label>
                            <Input
                              value={bulkCostRate}
                              onChange={(e) => setBulkCostRate(e.target.value)}
                              placeholder="380"
                              className="h-9 text-xs font-mono font-bold text-primary"
                              required
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs font-medium">GST Tax Rate</Label>
                            <Select value={bulkGst} onValueChange={setBulkGst}>
                              <SelectTrigger className="h-9 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {GST_OPTIONS.map((g) => (
                                  <SelectItem key={g.value} value={g.value} className="text-xs">
                                    {g.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Bulk Card 3: Quality Control & Shelf Life */}
                    <Card>
                      <CardHeader className="pb-3 border-b bg-muted/20">
                        <CardTitle className="text-sm font-bold flex items-center gap-2">
                          <ShieldCheck className="h-4 w-4 text-primary" />
                          3. Physical Quality Specs & Bulk Stability
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="pt-4 space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div className="space-y-1.5">
                            <Label className="text-xs font-medium">pH Target Range</Label>
                            <Input
                              value={bulkTargetPh}
                              onChange={(e) => setBulkTargetPh(e.target.value)}
                              placeholder="5.5 - 6.0"
                              className="h-9 text-xs font-mono"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs font-medium">Viscosity Spec</Label>
                            <Input
                              value={bulkViscosity}
                              onChange={(e) => setBulkViscosity(e.target.value)}
                              placeholder="12,000 - 15,000 cps"
                              className="h-9 text-xs font-mono"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs font-medium">Bulk Shelf Life</Label>
                            <Select value={bulkShelfLife} onValueChange={setBulkShelfLife}>
                              <SelectTrigger className="h-9 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {SHELF_LIFE_OPTIONS.map((sl) => (
                                  <SelectItem key={sl} value={sl} className="text-xs">
                                    {sl}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Bulk Card 4: Compounding Protocol */}
                    <Card>
                      <CardHeader className="pb-3 border-b bg-muted/20">
                        <CardTitle className="text-sm font-bold flex items-center gap-2">
                          <FlaskConical className="h-4 w-4 text-primary" />
                          4. Compounding Protocol & Active Actives
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="pt-4">
                        <Textarea
                          value={description}
                          onChange={(e) => setDescription(e.target.value)}
                          placeholder="e.g. Phase A: Heat deionized water to 75°C. Disperse polymer under high-shear homogenizer for 15 mins. Cool to 40°C before adding heat-sensitive actives."
                          rows={3}
                          className="text-xs leading-relaxed"
                        />
                      </CardContent>
                    </Card>
                  </>
                )}

                {/* 5. CATEGORY: RESEARCH & DEVELOPMENT (R&D) */}
                {invCategory === "rd" && (
                  <>
                    {/* RD Card 1: Identity */}
                    <Card>
                      <CardHeader className="pb-3 border-b bg-muted/20">
                        <CardTitle className="text-sm font-bold flex items-center gap-2">
                          <Sparkles className="h-4 w-4 text-primary" />
                          1. R&D Trial Project & Lab Sample Identity
                        </CardTitle>
                        <CardDescription className="text-xs">
                          Experimental lab formulations, stability trials, and client test samples
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="pt-4 space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                          <div className="sm:col-span-8 space-y-1.5">
                            <Label className="text-xs font-medium">Trial Sample Title *</Label>
                            <Input
                              value={title}
                              onChange={(e) => setTitle(e.target.value)}
                              placeholder="e.g. RD600-01 Kojic Acid & Alpha Arbutin Cream / SPF 50 Trial Batch"
                              className="h-9 text-xs font-medium"
                              required
                            />
                          </div>
                          <div className="sm:col-span-4 space-y-1.5">
                            <div className="flex items-center justify-between">
                              <Label className="text-xs font-medium">R&D Trial Code / Lab ID</Label>
                              <button
                                type="button"
                                onClick={handleAutoGenerateSku}
                                className="text-[10px] text-primary hover:underline font-medium"
                              >
                                Auto-Gen
                              </button>
                            </div>
                            <Input
                              value={sku}
                              onChange={(e) => setSku(e.target.value)}
                              placeholder="e.g. RD-600-01"
                              className="h-9 text-xs font-mono"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <Label className="text-xs font-medium">Target Category</Label>
                            <Select value={rdTargetCategory} onValueChange={setRdTargetCategory}>
                              <SelectTrigger className="h-9 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {categoryOptions.map((opt) => (
                                  <SelectItem key={opt.value} value={opt.value} className="text-xs">
                                    {opt.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs font-medium">R&D Pipeline Stage</Label>
                            <Select value={rdStage} onValueChange={setRdStage}>
                              <SelectTrigger className="h-9 text-xs font-semibold">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {RD_STAGES.map((s) => (
                                  <SelectItem key={s.value} value={s.value} className="text-xs">
                                    {s.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {/* RD Card 2: Sample Specifications */}
                    <Card>
                      <CardHeader className="pb-3 border-b bg-muted/20">
                        <CardTitle className="text-sm font-bold flex items-center gap-2">
                          <FlaskConical className="h-4 w-4 text-primary" />
                          2. Sample Parameters & Target Client
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="pt-4 space-y-4">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                          <div className="space-y-1.5">
                            <Label className="text-xs font-medium">Sample Volume / Size</Label>
                            <Input
                              value={rdSampleSize}
                              onChange={(e) => setRdSampleSize(e.target.value)}
                              placeholder="100"
                              className="h-9 text-xs font-mono"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs font-medium">Unit</Label>
                            <Select value={rdSampleUom} onValueChange={setRdSampleUom}>
                              <SelectTrigger className="h-9 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="gm" className="text-xs">gm (Grams)</SelectItem>
                                <SelectItem value="ml" className="text-xs">ml (Milliliters)</SelectItem>
                                <SelectItem value="pcs" className="text-xs">pcs (Pieces)</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs font-medium">Target Prospect / Client</Label>
                            <Input
                              value={rdClientProspect}
                              onChange={(e) => setRdClientProspect(e.target.value)}
                              placeholder="e.g. Skin Theta"
                              className="h-9 text-xs"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs font-medium">Pilot Batch Cost (₹)</Label>
                            <Input
                              value={rdLabCost}
                              onChange={(e) => setRdLabCost(e.target.value)}
                              placeholder="500"
                              className="h-9 text-xs font-mono font-bold"
                            />
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {/* RD Card 3: Key Target Actives & Stability */}
                    <Card>
                      <CardHeader className="pb-3 border-b bg-muted/20">
                        <CardTitle className="text-sm font-bold flex items-center gap-2">
                          <Layers className="h-4 w-4 text-primary" />
                          3. Target Actives, Claims & Stability Observations
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="pt-4">
                        <Textarea
                          value={description}
                          onChange={(e) => setDescription(e.target.value)}
                          placeholder="e.g. Key Actives: Kojic Acid Dipalmitate 2%, Alpha Arbutin 1.5%, Niacinamide 3%. Target claim: Hyperpigmentation reduction. Passed 30-day stability test at 40°C."
                          rows={3}
                          className="text-xs leading-relaxed"
                        />
                      </CardContent>
                    </Card>
                  </>
                )}

              </div>

              {/* Right Column: Live Context-Aware Preview Card (4 cols) */}
              <div className="lg:col-span-4 sticky top-6 space-y-4">
                <Card className="border-2 border-primary/20 shadow-md">
                  <CardHeader className="bg-primary/5 border-b pb-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold text-primary uppercase tracking-wider">
                        Live Master Preview
                      </span>
                      <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded font-bold uppercase">
                        {CATEGORY_TABS.find((t) => t.id === invCategory)?.label.split(" ")[0]}
                      </span>
                    </div>
                    <CardTitle className="text-base font-bold truncate mt-1">
                      {title.trim() || `Untitled ${CATEGORY_TABS.find((t) => t.id === invCategory)?.label.split(" ")[0]}`}
                    </CardTitle>
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      {sku ? (
                        <span className="font-mono text-[10px] bg-background border px-1.5 py-0.5 rounded text-foreground font-semibold">
                          {sku}
                        </span>
                      ) : null}
                      {invCategory === "fg" && clientBrand ? (
                        <span className="text-[10px] text-muted-foreground font-medium">
                          Brand: {clientBrand.trim()}
                        </span>
                      ) : null}
                    </div>
                  </CardHeader>

                  <CardContent className="pt-4 space-y-3.5 text-xs">

                    {/* FINISHED GOODS PREVIEW */}
                    {invCategory === "fg" && (
                      <>
                        <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">Standard Volume:</span>
                            <strong className="font-mono">{fgPackSize || "50"} {fgUom}</strong>
                          </div>
                          <div className="flex items-center justify-between border-t pt-1.5">
                            <span className="text-muted-foreground">Printed MRP:</span>
                            <strong className="font-mono text-muted-foreground">₹{numFgMrp.toLocaleString("en-IN")}</strong>
                          </div>
                          <div className="flex items-center justify-between border-t pt-1.5">
                            <span className="text-muted-foreground">Contract Rate:</span>
                            <strong className="font-mono text-primary text-sm font-black">₹{numFgRate.toLocaleString("en-IN")}</strong>
                          </div>
                          <div className="flex items-center justify-between border-t pt-1.5">
                            <span className="text-muted-foreground">Brand Margin %:</span>
                            <span className="font-mono font-bold text-status-success-text">{fgMarginPercent}%</span>
                          </div>
                        </div>

                        <div className="space-y-1.5 text-muted-foreground">
                          <div className="text-[11px] font-semibold uppercase tracking-wider text-foreground">
                            Batch Economics (MOQ {numFgMoq.toLocaleString("en-IN")} Units)
                          </div>
                          <div className="flex items-center justify-between">
                            <span>Taxable Value:</span>
                            <span className="font-mono text-foreground font-medium">₹{fgMoqBatchTaxable.toLocaleString("en-IN")}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span>GST ({fgGst}%):</span>
                            <span className="font-mono text-foreground font-medium">₹{fgMoqBatchTax.toLocaleString("en-IN")}</span>
                          </div>
                          <div className="flex items-center justify-between border-t pt-1.5 font-bold text-foreground">
                            <span>Total Batch Cost:</span>
                            <span className="font-mono text-primary font-black text-sm">₹{fgMoqBatchTotal.toLocaleString("en-IN")}</span>
                          </div>
                        </div>

                        <div className="border-t pt-3 space-y-1 text-[11px] text-muted-foreground">
                          <div>• Shelf Life: <span className="text-foreground">{fgShelfLife}</span></div>
                          <div>• Category: <span className="text-foreground">{fgCategory}</span></div>
                        </div>
                      </>
                    )}

                    {/* RAW MATERIALS PREVIEW */}
                    {invCategory === "rm" && (
                      <>
                        <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">Classification:</span>
                            <strong className="font-medium text-foreground">{rmClassification}</strong>
                          </div>
                          <div className="flex items-center justify-between border-t pt-1.5">
                            <span className="text-muted-foreground">Purchase Rate:</span>
                            <strong className="font-mono text-primary text-sm font-black">
                              ₹{numRmRate.toLocaleString("en-IN")} / {rmUom}
                            </strong>
                          </div>
                          <div className="flex items-center justify-between border-t pt-1.5">
                            <span className="text-muted-foreground">Reorder Safety Level:</span>
                            <strong className="font-mono text-foreground">{rmReorderLevel || "0"} {rmUom}</strong>
                          </div>
                        </div>

                        <div className="space-y-1.5 text-muted-foreground">
                          <div className="text-[11px] font-semibold uppercase tracking-wider text-foreground">
                            Safety Stock Value ({rmReorderLevel} {rmUom})
                          </div>
                          <div className="flex items-center justify-between">
                            <span>Inventory Value:</span>
                            <span className="font-mono text-foreground font-medium">₹{rmMinStockValue.toLocaleString("en-IN")}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span>Est. GST ({rmGst}%):</span>
                            <span className="font-mono text-foreground font-medium">₹{rmMinStockTax.toLocaleString("en-IN")}</span>
                          </div>
                        </div>

                        <div className="border-t pt-3 space-y-1 text-[11px] text-muted-foreground">
                          <div>• Storage: <span className="text-foreground">{rmStorage}</span></div>
                          <div>• Retest Period: <span className="text-foreground">{rmRetestPeriod}</span></div>
                          <div>• Lead Time: <span className="text-foreground">{rmLeadTimeDays || "7"} Days</span></div>
                        </div>
                      </>
                    )}

                    {/* PACKAGING MATERIALS PREVIEW */}
                    {invCategory === "pm" && (
                      <>
                        <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">Packaging Type:</span>
                            <strong className="font-medium text-foreground">{pmType}</strong>
                          </div>
                          <div className="flex items-center justify-between border-t pt-1.5">
                            <span className="text-muted-foreground">Material:</span>
                            <strong className="font-medium text-foreground">{pmMaterial}</strong>
                          </div>
                          <div className="flex items-center justify-between border-t pt-1.5">
                            <span className="text-muted-foreground">Unit Cost:</span>
                            <strong className="font-mono text-primary text-sm font-black">
                              ₹{numPmRate.toLocaleString("en-IN")} / {pmUom}
                            </strong>
                          </div>
                          <div className="flex items-center justify-between border-t pt-1.5">
                            <span className="text-muted-foreground">Supplier MOQ:</span>
                            <strong className="font-mono text-foreground">{numPmMoq.toLocaleString("en-IN")} {pmUom}</strong>
                          </div>
                        </div>

                        <div className="space-y-1.5 text-muted-foreground">
                          <div className="text-[11px] font-semibold uppercase tracking-wider text-foreground">
                            MOQ Procurement Order Value
                          </div>
                          <div className="flex items-center justify-between">
                            <span>Taxable Value:</span>
                            <span className="font-mono text-foreground font-medium">₹{pmMoqBatchTaxable.toLocaleString("en-IN")}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span>GST ({pmGst}%):</span>
                            <span className="font-mono text-foreground font-medium">₹{pmMoqBatchTax.toLocaleString("en-IN")}</span>
                          </div>
                          <div className="flex items-center justify-between border-t pt-1.5 font-bold text-foreground">
                            <span>Total MOQ Value:</span>
                            <span className="font-mono text-primary font-black text-sm">₹{pmMoqBatchTotal.toLocaleString("en-IN")}</span>
                          </div>
                        </div>

                        <div className="border-t pt-3 space-y-1 text-[11px] text-muted-foreground">
                          <div>• Volume / Neck: <span className="text-foreground">{pmVolume} • {pmNeckSize}</span></div>
                          <div>• Lead Time: <span className="text-foreground">{pmLeadTimeDays || "14"} Days</span></div>
                        </div>
                      </>
                    )}

                    {/* BULK FORMULATION PREVIEW */}
                    {invCategory === "bulk" && (
                      <>
                        <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">Matrix:</span>
                            <strong className="font-medium text-foreground">{bulkMatrix}</strong>
                          </div>
                          <div className="flex items-center justify-between border-t pt-1.5">
                            <span className="text-muted-foreground">Batch Sizing:</span>
                            <strong className="font-mono text-foreground">{bulkBatchSize || "100"} {bulkUom}</strong>
                          </div>
                          <div className="flex items-center justify-between border-t pt-1.5">
                            <span className="text-muted-foreground">Compounding Rate:</span>
                            <strong className="font-mono text-primary text-sm font-black">
                              ₹{numBulkRate.toLocaleString("en-IN")} / {bulkUom}
                            </strong>
                          </div>
                          <div className="flex items-center justify-between border-t pt-1.5">
                            <span className="text-muted-foreground">Standard Batch Value:</span>
                            <strong className="font-mono text-foreground">₹{bulkTotalBatchValue.toLocaleString("en-IN")}</strong>
                          </div>
                        </div>

                        <div className="border-t pt-3 space-y-1 text-[11px] text-muted-foreground">
                          <div>• Target pH: <span className="text-foreground">{bulkTargetPh}</span></div>
                          <div>• Viscosity: <span className="text-foreground">{bulkViscosity}</span></div>
                          <div>• Shelf Life: <span className="text-foreground">{bulkShelfLife}</span></div>
                        </div>
                      </>
                    )}

                    {/* R&D PREVIEW */}
                    {invCategory === "rd" && (
                      <>
                        <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">Target Category:</span>
                            <strong className="font-medium text-foreground">{rdTargetCategory}</strong>
                          </div>
                          <div className="flex items-center justify-between border-t pt-1.5">
                            <span className="text-muted-foreground">Pipeline Stage:</span>
                            <span className="text-primary font-bold text-xs bg-primary/10 px-1.5 py-0.5 rounded">
                              {rdStage}
                            </span>
                          </div>
                          <div className="flex items-center justify-between border-t pt-1.5">
                            <span className="text-muted-foreground">Sample Size:</span>
                            <strong className="font-mono text-foreground">{rdSampleSize} {rdSampleUom}</strong>
                          </div>
                          <div className="flex items-center justify-between border-t pt-1.5">
                            <span className="text-muted-foreground">Pilot Batch Cost:</span>
                            <strong className="font-mono text-primary text-sm font-black">₹{rdLabCost}</strong>
                          </div>
                        </div>

                        {rdClientProspect ? (
                          <div className="border-t pt-2 text-[11px] text-muted-foreground">
                            Target Client: <span className="text-foreground font-semibold">{rdClientProspect}</span>
                          </div>
                        ) : null}
                      </>
                    )}

                    <div className="pt-2">
                      <Button
                        type="button"
                        className="w-full font-bold"
                        onClick={handleSubmit}
                        disabled={submitting || !title.trim()}
                      >
                        {submitting ? "Saving Master Item..." : "Save Master Item"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </form>
        </div>
      </PageBody>
    </Page>
  )
}
