import { Migration } from '@mikro-orm/migrations';

export class Migration20261009103807_cc_accounts extends Migration {

  override up(): void | Promise<void> {
    this.addSql(`alter table "cc_company_profiles" add "iec" text null, add "lut_arn" text null, add "lut_valid_till" text null;`);

    this.addSql(`alter table "cc_tax_invoices" add "export_details" jsonb null;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "cc_company_profiles" drop column "iec", drop column "lut_arn", drop column "lut_valid_till";`);

    this.addSql(`alter table "cc_tax_invoices" drop column "export_details";`);
  }

}
