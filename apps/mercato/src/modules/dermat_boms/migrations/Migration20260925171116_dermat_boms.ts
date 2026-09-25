import { Migration } from '@mikro-orm/migrations';

export class Migration20260925171116_dermat_boms extends Migration {

  override up(): void | Promise<void> {
    this.addSql(`alter table "dermat_bom_items" add "fill_qty" numeric(12,3) null, add "fill_unit" text null;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "dermat_bom_items" drop column "fill_qty", drop column "fill_unit";`);
  }

}
