import { Migration } from '@mikro-orm/migrations';

export class Migration20260927051037_cc_purchase extends Migration {

  override up(): void | Promise<void> {
    this.addSql(`alter table "cc_grns" alter column "po_code" drop not null;`);
    this.addSql(`alter table "cc_grns" alter column "po_id" drop not null;`);

    this.addSql(`alter table "cc_grn_lines" add "rate" numeric(14,4) null, add "gst_percent" numeric(5,2) null;`);
    this.addSql(`alter table "cc_grn_lines" alter column "po_line_id" drop not null;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "cc_grn_lines" drop column "rate", drop column "gst_percent";`);
    this.addSql(`alter table "cc_grn_lines" alter column "po_line_id" set not null;`);

    this.addSql(`alter table "cc_grns" alter column "po_id" set not null;`);
    this.addSql(`alter table "cc_grns" alter column "po_code" set not null;`);
  }

}
