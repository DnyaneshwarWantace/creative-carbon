import { Migration } from '@mikro-orm/migrations';

export class Migration20261008074336_cc_crm extends Migration {

  override up(): void | Promise<void> {
    this.addSql(`create table "cc_enquiries" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "enquiry_no" text not null, "source" text not null, "received_at" timestamptz not null, "customer_id" uuid null, "company_name" text null, "contact_name" text null, "phone" text null, "email" text null, "place" text null, "subject" text not null, "details" text null, "owner_name" text null, "stage" text not null default 'new', "next_action_on" text null, "next_action_note" text null, "lost_reason" text null, "order_id" uuid null, "by_name" text null, "history" jsonb not null default '[]', "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, primary key ("id"));`);
    this.addSql(`create index "cc_enquiries_scope_idx" on "cc_enquiries" ("organization_id", "tenant_id", "stage");`);

    this.addSql(`create table "cc_quotations" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "quote_no" text not null, "quote_date" text not null, "valid_until" text null, "enquiry_id" uuid null, "customer_id" uuid not null, "currency" text not null default 'INR', "total_amount" numeric(16,2) not null default '0', "data" jsonb not null, "status" text not null default 'draft', "sent_at" timestamptz null, "order_id" uuid null, "order_no" text null, "by_name" text null, "history" jsonb not null default '[]', "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, primary key ("id"));`);
    this.addSql(`create index "cc_quotations_scope_idx" on "cc_quotations" ("organization_id", "tenant_id", "status");`);
  }

}
