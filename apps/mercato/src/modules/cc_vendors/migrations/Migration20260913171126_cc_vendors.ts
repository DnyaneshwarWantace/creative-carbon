import { Migration } from '@mikro-orm/migrations';

export class Migration20260913171126_cc_vendors extends Migration {

  override up(): void | Promise<void> {
    this.addSql(`create table "cc_vendors" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "name" text not null, "code" text null, "gst_number" text null, "contact_person" text null, "contact_phone" text null, "contact_email" text null, "address" text null, "payment_terms" text null, "category" text null, "is_active" boolean not null default true, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, primary key ("id"));`);
    this.addSql(`create index "cc_vendors_org_tenant_idx" on "cc_vendors" ("organization_id", "tenant_id");`);
    this.addSql(`alter table "cc_vendors" add constraint "cc_vendors_org_tenant_code_uq" unique ("organization_id", "tenant_id", "code");`);
  }

}
