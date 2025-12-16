import { nanoid } from "nanoid";
import {
  FormsAdapter,
  Form,
  FormInsert,
  ListFormsResponse,
  ListParams,
} from "@authhero/adapter-interfaces";
import { DynamoDBContext, DynamoDBBaseItem } from "../types";
import { formKeys } from "../keys";
import {
  getItem,
  putItem,
  deleteItem,
  queryWithPagination,
  updateItem,
  stripDynamoDBFields,
  removeNullProperties,
} from "../utils";

interface FormItem extends DynamoDBBaseItem {
  id: string;
  tenant_id: string;
  name: string;
  nodes?: string; // JSON array string
  start?: string; // JSON string
  ending?: string; // JSON string
  messages?: string; // JSON string
  languages?: string; // JSON string
  translations?: string; // JSON string
  style?: string; // JSON string
}

function toForm(item: FormItem): Form {
  const { tenant_id, ...rest } = stripDynamoDBFields(item);

  return removeNullProperties({
    ...rest,
    nodes: item.nodes ? JSON.parse(item.nodes) : undefined,
    start: item.start ? JSON.parse(item.start) : undefined,
    ending: item.ending ? JSON.parse(item.ending) : undefined,
    messages: item.messages ? JSON.parse(item.messages) : undefined,
    languages: item.languages ? JSON.parse(item.languages) : undefined,
    translations: item.translations ? JSON.parse(item.translations) : undefined,
    style: item.style ? JSON.parse(item.style) : undefined,
  }) as Form;
}

export function createFormsAdapter(ctx: DynamoDBContext): FormsAdapter {
  return {
    async create(tenantId: string, form: FormInsert): Promise<Form> {
      const now = new Date().toISOString();
      const id = nanoid();

      const item: FormItem = {
        PK: formKeys.pk(tenantId),
        SK: formKeys.sk(id),
        entityType: "FORM",
        tenant_id: tenantId,
        id,
        name: form.name,
        nodes: form.nodes ? JSON.stringify(form.nodes) : undefined,
        start: form.start ? JSON.stringify(form.start) : undefined,
        ending: form.ending ? JSON.stringify(form.ending) : undefined,
        messages: form.messages ? JSON.stringify(form.messages) : undefined,
        languages: form.languages ? JSON.stringify(form.languages) : undefined,
        translations: form.translations
          ? JSON.stringify(form.translations)
          : undefined,
        style: form.style ? JSON.stringify(form.style) : undefined,
        created_at: now,
        updated_at: now,
      };

      await putItem(ctx, item);

      return toForm(item);
    },

    async get(tenantId: string, formId: string): Promise<Form | null> {
      const item = await getItem<FormItem>(
        ctx,
        formKeys.pk(tenantId),
        formKeys.sk(formId),
      );

      if (!item) return null;

      return toForm(item);
    },

    async list(
      tenantId: string,
      params: ListParams = {},
    ): Promise<ListFormsResponse> {
      const result = await queryWithPagination<FormItem>(
        ctx,
        formKeys.pk(tenantId),
        params,
        { skPrefix: "FORM#" },
      );

      return {
        forms: result.items.map(toForm),
        start: result.start,
        limit: result.limit,
        length: result.length,
      };
    },

    async update(
      tenantId: string,
      formId: string,
      form: Partial<FormInsert>,
    ): Promise<boolean> {
      const updates: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };

      if (form.name !== undefined) updates.name = form.name;
      if (form.nodes !== undefined) updates.nodes = JSON.stringify(form.nodes);
      if (form.start !== undefined) updates.start = JSON.stringify(form.start);
      if (form.ending !== undefined) updates.ending = JSON.stringify(form.ending);
      if (form.messages !== undefined)
        updates.messages = JSON.stringify(form.messages);
      if (form.languages !== undefined)
        updates.languages = JSON.stringify(form.languages);
      if (form.translations !== undefined)
        updates.translations = JSON.stringify(form.translations);
      if (form.style !== undefined) updates.style = JSON.stringify(form.style);

      return updateItem(
        ctx,
        formKeys.pk(tenantId),
        formKeys.sk(formId),
        updates,
      );
    },

    async remove(tenantId: string, formId: string): Promise<boolean> {
      return deleteItem(ctx, formKeys.pk(tenantId), formKeys.sk(formId));
    },
  };
}
