import type { PickerOption } from '../../../dermat_orders/components/SearchPicker'
import type { Customer } from '../../../dermat_orders/components/types'
import type { IngredientRef, RdRequest } from '../types'

export type RequestForm = {
  kind: 'client' | 'npd'
  customer: PickerOption<Customer> | null
  orderId: string | null
  productName: string
  brand: string
  productType: string
  packSize: string
  textureReference: string
  texture: string
  fragrance: string
  colour: string
  targetPh: string
  claims: string
  sampleQty: string
  dueDate: string
  ingredientRefs: IngredientRef[]
  ingredients: string
  clientInstruction: string
  notes: string
}

export const EMPTY_REQUEST_FORM: RequestForm = {
  kind: 'client',
  customer: null,
  orderId: null,
  productName: '',
  brand: '',
  productType: '',
  packSize: '',
  textureReference: '',
  texture: '',
  fragrance: '',
  colour: '',
  targetPh: '',
  claims: '',
  sampleQty: '',
  dueDate: '',
  ingredientRefs: [],
  ingredients: '',
  clientInstruction: '',
  notes: '',
}

export function formFromRequest(request: RdRequest): RequestForm {
  return {
    kind: request.kind,
    customer: request.customerId ? { id: request.customerId, primary: request.customerName ?? '', value: { id: request.customerId, name: request.customerName ?? '' } as Customer } : null,
    orderId: request.orderId,
    productName: request.productName,
    brand: request.brand ?? '',
    productType: request.productType ?? '',
    packSize: request.packSize ?? '',
    textureReference: request.textureReference ?? '',
    texture: request.texture ?? '',
    fragrance: request.fragrance ?? '',
    colour: request.colour ?? '',
    targetPh: request.targetPh ?? '',
    claims: request.claims ?? '',
    sampleQty: request.sampleQty ?? '',
    dueDate: request.dueDate ?? '',
    ingredientRefs: request.ingredientRefs ?? [],
    ingredients: request.ingredients ?? '',
    clientInstruction: request.clientInstruction ?? '',
    notes: request.notes ?? '',
  }
}

export function bodyFromForm(form: RequestForm, id?: string): Record<string, unknown> {
  return {
    ...(id ? { id } : {}),
    kind: form.kind,
    customerId: form.customer?.id ?? null,
    orderId: form.orderId,
    productName: form.productName,
    brand: form.brand,
    productType: form.productType,
    packSize: form.packSize,
    textureReference: form.textureReference,
    texture: form.texture,
    fragrance: form.fragrance,
    colour: form.colour,
    targetPh: form.targetPh,
    claims: form.claims,
    sampleQty: form.sampleQty,
    dueDate: form.dueDate || null,
    ingredientRefs: form.ingredientRefs,
    ingredients: form.ingredients,
    clientInstruction: form.clientInstruction,
    notes: form.notes,
  }
}
