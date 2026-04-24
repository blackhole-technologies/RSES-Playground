/**
 * @file registry.ts
 * @description Field Widget and Formatter Registry
 * @phase Phase 9 - CMS Content Type System
 * @author CMS (CMS Developer Agent)
 * @created 2026-02-01
 *
 * Provides registration and discovery of:
 * - Field types with their storage and instance settings
 * - Field widgets for form display
 * - Field formatters for view display
 *
 * This follows Drupal's plugin system pattern but simplified for TypeScript.
 */

import type {
  FieldType,
  WidgetDefinition,
  FormatterDefinition,
  FieldStorageSettings,
  FieldInstanceSettings,
} from "@shared/cms/types";

// =============================================================================
// FIELD TYPE DEFINITIONS
// =============================================================================

export interface FieldTypeDefinition {
  id: FieldType;
  label: string;
  description: string;
  category: "text" | "number" | "boolean" | "datetime" | "list" | "reference" | "file" | "special" | "rses";
  defaultWidget: string;
  defaultFormatter: string;
  /** Default storage settings for this field type */
  storageSettings: Partial<FieldStorageSettings>;
  /** Default instance settings for this field type */
  instanceSettings: Partial<FieldInstanceSettings>;
  /** Whether this field type supports multiple values */
  supportsCardinality: boolean;
  /** Whether this field type can be used as entity label */
  canBeLabel: boolean;
}

const fieldTypes: Map<FieldType, FieldTypeDefinition> = new Map();

// Register core field types
const coreFieldTypes: FieldTypeDefinition[] = [
  // Text fields
  {
    id: "string",
    label: "Text (plain)",
    description: "Short plain text string up to 255 characters",
    category: "text",
    defaultWidget: "string_textfield",
    defaultFormatter: "string",
    storageSettings: { maxLength: 255 },
    instanceSettings: {},
    supportsCardinality: true,
    canBeLabel: true,
  },
  {
    id: "string_long",
    label: "Text (plain, long)",
    description: "Long plain text without character limit",
    category: "text",
    defaultWidget: "string_textarea",
    defaultFormatter: "string",
    storageSettings: {},
    instanceSettings: {},
    supportsCardinality: true,
    canBeLabel: false,
  },
  {
    id: "text",
    label: "Text (formatted)",
    description: "Text with format/filter applied",
    category: "text",
    defaultWidget: "text_textfield",
    defaultFormatter: "text_default",
    storageSettings: { maxLength: 255 },
    instanceSettings: { textProcessing: true },
    supportsCardinality: true,
    canBeLabel: true,
  },
  {
    id: "text_long",
    label: "Text (formatted, long)",
    description: "Long formatted text",
    category: "text",
    defaultWidget: "text_textarea",
    defaultFormatter: "text_default",
    storageSettings: {},
    instanceSettings: { textProcessing: true },
    supportsCardinality: true,
    canBeLabel: false,
  },
  {
    id: "text_with_summary",
    label: "Text (formatted, long, with summary)",
    description: "Long formatted text with summary field",
    category: "text",
    defaultWidget: "text_textarea_with_summary",
    defaultFormatter: "text_default",
    storageSettings: {},
    instanceSettings: { textProcessing: true, displaySummary: true },
    supportsCardinality: false,
    canBeLabel: false,
  },

  // Numeric fields
  {
    id: "integer",
    label: "Number (integer)",
    description: "Stores whole numbers",
    category: "number",
    defaultWidget: "number",
    defaultFormatter: "number_integer",
    storageSettings: { unsigned: false },
    instanceSettings: {},
    supportsCardinality: true,
    canBeLabel: false,
  },
  {
    id: "decimal",
    label: "Number (decimal)",
    description: "Stores decimal numbers with precision",
    category: "number",
    defaultWidget: "number",
    defaultFormatter: "number_decimal",
    storageSettings: { precision: 10, scale: 2 },
    instanceSettings: {},
    supportsCardinality: true,
    canBeLabel: false,
  },
  {
    id: "float",
    label: "Number (float)",
    description: "Stores floating point numbers",
    category: "number",
    defaultWidget: "number",
    defaultFormatter: "number_decimal",
    storageSettings: {},
    instanceSettings: {},
    supportsCardinality: true,
    canBeLabel: false,
  },

  // Boolean
  {
    id: "boolean",
    label: "Boolean",
    description: "True/false value",
    category: "boolean",
    defaultWidget: "boolean_checkbox",
    defaultFormatter: "boolean",
    storageSettings: {},
    instanceSettings: {},
    supportsCardinality: false,
    canBeLabel: false,
  },

  // Date/time
  {
    id: "datetime",
    label: "Date",
    description: "Date and optional time",
    category: "datetime",
    defaultWidget: "datetime_default",
    defaultFormatter: "datetime_default",
    storageSettings: {},
    instanceSettings: {},
    supportsCardinality: true,
    canBeLabel: false,
  },
  {
    id: "daterange",
    label: "Date range",
    description: "Start and end date/time",
    category: "datetime",
    defaultWidget: "daterange_default",
    defaultFormatter: "daterange_default",
    storageSettings: {},
    instanceSettings: {},
    supportsCardinality: true,
    canBeLabel: false,
  },
  {
    id: "timestamp",
    label: "Timestamp",
    description: "Unix timestamp",
    category: "datetime",
    defaultWidget: "datetime_timestamp",
    defaultFormatter: "timestamp_ago",
    storageSettings: {},
    instanceSettings: {},
    supportsCardinality: true,
    canBeLabel: false,
  },

  // List fields
  {
    id: "list_string",
    label: "List (text)",
    description: "Text from a predefined list of options",
    category: "list",
    defaultWidget: "options_select",
    defaultFormatter: "list_default",
    storageSettings: { allowedValues: [] },
    instanceSettings: {},
    supportsCardinality: true,
    canBeLabel: false,
  },
  {
    id: "list_integer",
    label: "List (integer)",
    description: "Integer from a predefined list of options",
    category: "list",
    defaultWidget: "options_select",
    defaultFormatter: "list_default",
    storageSettings: { allowedValues: [] },
    instanceSettings: {},
    supportsCardinality: true,
    canBeLabel: false,
  },
  {
    id: "list_float",
    label: "List (float)",
    description: "Float from a predefined list of options",
    category: "list",
    defaultWidget: "options_select",
    defaultFormatter: "list_default",
    storageSettings: { allowedValues: [] },
    instanceSettings: {},
    supportsCardinality: true,
    canBeLabel: false,
  },

  // Reference fields
  {
    id: "entity_reference",
    label: "Entity reference",
    description: "Reference to another entity",
    category: "reference",
    defaultWidget: "entity_reference_autocomplete",
    defaultFormatter: "entity_reference_label",
    storageSettings: { targetType: "content" },
    instanceSettings: {
      handlerSettings: {
        targetBundles: {},
        sort: { field: "title", direction: "ASC" },
      },
    },
    supportsCardinality: true,
    canBeLabel: false,
  },
  {
    id: "entity_reference_revisions",
    label: "Entity reference (revisions)",
    description: "Reference with revision tracking",
    category: "reference",
    defaultWidget: "entity_reference_autocomplete",
    defaultFormatter: "entity_reference_entity_view",
    storageSettings: { targetType: "content" },
    instanceSettings: {},
    supportsCardinality: true,
    canBeLabel: false,
  },
  {
    id: "taxonomy_term_reference",
    label: "Taxonomy term",
    description: "Reference to taxonomy terms",
    category: "reference",
    defaultWidget: "options_select",
    defaultFormatter: "entity_reference_label",
    storageSettings: { targetType: "taxonomy_term" },
    instanceSettings: {
      handlerSettings: {
        targetBundles: {},
        autoCreateBundle: undefined,
      },
    },
    supportsCardinality: true,
    canBeLabel: false,
  },

  // File fields
  {
    id: "file",
    label: "File",
    description: "File upload",
    category: "file",
    defaultWidget: "file_generic",
    defaultFormatter: "file_default",
    storageSettings: { uriScheme: "public" },
    instanceSettings: {
      fileExtensions: "txt pdf doc docx",
      maxFilesize: "10MB",
      fileDirectory: "files",
    },
    supportsCardinality: true,
    canBeLabel: false,
  },
  {
    id: "image",
    label: "Image",
    description: "Image upload with alt/title",
    category: "file",
    defaultWidget: "image_image",
    defaultFormatter: "image",
    storageSettings: { uriScheme: "public" },
    instanceSettings: {
      fileExtensions: "png gif jpg jpeg webp",
      maxFilesize: "5MB",
      fileDirectory: "images",
      altFieldRequired: true,
      titleFieldRequired: false,
    },
    supportsCardinality: true,
    canBeLabel: false,
  },

  // Special fields
  {
    id: "link",
    label: "Link",
    description: "URL with optional title",
    category: "special",
    defaultWidget: "link_default",
    defaultFormatter: "link",
    storageSettings: {},
    instanceSettings: {},
    supportsCardinality: true,
    canBeLabel: false,
  },
  {
    id: "email",
    label: "Email",
    description: "Email address",
    category: "special",
    defaultWidget: "email_default",
    defaultFormatter: "email_mailto",
    storageSettings: {},
    instanceSettings: {},
    supportsCardinality: true,
    canBeLabel: false,
  },
  {
    id: "telephone",
    label: "Telephone",
    description: "Phone number",
    category: "special",
    defaultWidget: "telephone_default",
    defaultFormatter: "telephone_link",
    storageSettings: {},
    instanceSettings: {},
    supportsCardinality: true,
    canBeLabel: false,
  },
  {
    id: "uri",
    label: "URI",
    description: "Uniform Resource Identifier",
    category: "special",
    defaultWidget: "uri",
    defaultFormatter: "uri_link",
    storageSettings: {},
    instanceSettings: {},
    supportsCardinality: true,
    canBeLabel: false,
  },
  {
    id: "uuid",
    label: "UUID",
    description: "Universally Unique Identifier",
    category: "special",
    defaultWidget: "hidden",
    defaultFormatter: "string",
    storageSettings: {},
    instanceSettings: {},
    supportsCardinality: false,
    canBeLabel: false,
  },
  {
    id: "password",
    label: "Password",
    description: "Password with confirmation",
    category: "special",
    defaultWidget: "password_confirm",
    defaultFormatter: "hidden",
    storageSettings: {},
    instanceSettings: {},
    supportsCardinality: false,
    canBeLabel: false,
  },
  {
    id: "computed",
    label: "Computed",
    description: "Computed/virtual field",
    category: "special",
    defaultWidget: "hidden",
    defaultFormatter: "computed",
    storageSettings: {},
    instanceSettings: {},
    supportsCardinality: false,
    canBeLabel: false,
  },

  // RSES-specific fields
  {
    id: "rses_classification",
    label: "RSES Classification",
    description: "Stores RSES classification results (sets, topics, types)",
    category: "rses",
    defaultWidget: "rses_classification_widget",
    defaultFormatter: "rses_classification_default",
    storageSettings: { rsesConfigId: undefined },
    instanceSettings: {
      rsesCategories: ["topic", "type", "set"],
      rsesAutoClassify: true,
    },
    supportsCardinality: false,
    canBeLabel: false,
  },
  {
    id: "rses_symlink",
    label: "RSES Symlink",
    description: "Reference to RSES symlink paths",
    category: "rses",
    defaultWidget: "rses_symlink_widget",
    defaultFormatter: "rses_symlink_default",
    storageSettings: {},
    instanceSettings: {},
    supportsCardinality: true,
    canBeLabel: false,
  },
];

// Register all field types
for (const ft of coreFieldTypes) {
  fieldTypes.set(ft.id, ft);
}

// =============================================================================
// WIDGET DEFINITIONS
// =============================================================================

const widgets: Map<string, WidgetDefinition> = new Map();

const coreWidgets: WidgetDefinition[] = [
  // Text widgets
  {
    id: "string_textfield",
    label: "Textfield",
    fieldTypes: ["string", "text"],
    settings: {
      size: { type: "number", label: "Size", default: 60 },
      placeholder: { type: "string", label: "Placeholder", default: "" },
    },
    class: "StringTextfieldWidget",
  },
  {
    id: "string_textarea",
    label: "Textarea",
    fieldTypes: ["string_long", "text_long"],
    settings: {
      rows: { type: "number", label: "Rows", default: 5 },
      placeholder: { type: "string", label: "Placeholder", default: "" },
    },
    class: "StringTextareaWidget",
  },
  {
    id: "text_textfield",
    label: "Textfield with format",
    fieldTypes: ["text"],
    settings: {
      size: { type: "number", label: "Size", default: 60 },
      placeholder: { type: "string", label: "Placeholder", default: "" },
    },
    class: "TextTextfieldWidget",
  },
  {
    id: "text_textarea",
    label: "Textarea with format",
    fieldTypes: ["text_long"],
    settings: {
      rows: { type: "number", label: "Rows", default: 5 },
      placeholder: { type: "string", label: "Placeholder", default: "" },
    },
    class: "TextTextareaWidget",
  },
  {
    id: "text_textarea_with_summary",
    label: "Textarea with summary",
    fieldTypes: ["text_with_summary"],
    settings: {
      rows: { type: "number", label: "Rows", default: 9 },
      summaryRows: { type: "number", label: "Summary rows", default: 3 },
    },
    class: "TextTextareaWithSummaryWidget",
  },

  // Number widgets
  {
    id: "number",
    label: "Number field",
    fieldTypes: ["integer", "decimal", "float"],
    settings: {
      placeholder: { type: "string", label: "Placeholder", default: "" },
      prefix: { type: "string", label: "Prefix", default: "" },
      suffix: { type: "string", label: "Suffix", default: "" },
    },
    class: "NumberWidget",
  },

  // Boolean widgets
  {
    id: "boolean_checkbox",
    label: "Single checkbox",
    fieldTypes: ["boolean"],
    settings: {
      displayLabel: { type: "boolean", label: "Display label", default: true },
    },
    class: "BooleanCheckboxWidget",
  },

  // Date widgets
  {
    id: "datetime_default",
    label: "Date and time",
    fieldTypes: ["datetime"],
    settings: {
      dateFormat: { type: "string", label: "Date format", default: "Y-m-d" },
      timeFormat: { type: "string", label: "Time format", default: "H:i" },
    },
    class: "DatetimeDefaultWidget",
  },
  {
    id: "datetime_timestamp",
    label: "Timestamp",
    fieldTypes: ["timestamp"],
    settings: {},
    class: "DatetimeTimestampWidget",
  },
  {
    id: "daterange_default",
    label: "Date range",
    fieldTypes: ["daterange"],
    settings: {
      dateFormat: { type: "string", label: "Date format", default: "Y-m-d" },
    },
    class: "DaterangeDefaultWidget",
  },

  // Options widgets
  {
    id: "options_select",
    label: "Select list",
    fieldTypes: ["list_string", "list_integer", "list_float", "taxonomy_term_reference"],
    settings: {},
    class: "OptionsSelectWidget",
  },
  {
    id: "options_buttons",
    label: "Radio buttons/Checkboxes",
    fieldTypes: ["list_string", "list_integer", "list_float", "taxonomy_term_reference", "boolean"],
    settings: {},
    class: "OptionsButtonsWidget",
  },

  // Entity reference widgets
  {
    id: "entity_reference_autocomplete",
    label: "Autocomplete",
    fieldTypes: ["entity_reference", "entity_reference_revisions", "taxonomy_term_reference"],
    settings: {
      matchOperator: { type: "select", label: "Match operator", default: "CONTAINS", options: { CONTAINS: "Contains", STARTS_WITH: "Starts with" } },
      size: { type: "number", label: "Size", default: 60 },
      placeholder: { type: "string", label: "Placeholder", default: "" },
    },
    class: "EntityReferenceAutocompleteWidget",
  },
  {
    id: "entity_reference_autocomplete_tags",
    label: "Autocomplete (Tags style)",
    fieldTypes: ["entity_reference", "taxonomy_term_reference"],
    settings: {
      matchOperator: { type: "select", label: "Match operator", default: "CONTAINS", options: { CONTAINS: "Contains", STARTS_WITH: "Starts with" } },
    },
    class: "EntityReferenceAutocompleteTagsWidget",
  },

  // File widgets
  {
    id: "file_generic",
    label: "File",
    fieldTypes: ["file"],
    settings: {
      progress: { type: "boolean", label: "Show progress", default: true },
    },
    class: "FileGenericWidget",
  },
  {
    id: "image_image",
    label: "Image",
    fieldTypes: ["image"],
    settings: {
      progress: { type: "boolean", label: "Show progress", default: true },
      previewImageStyle: { type: "string", label: "Preview style", default: "thumbnail" },
    },
    class: "ImageImageWidget",
  },

  // Link widget
  {
    id: "link_default",
    label: "Link",
    fieldTypes: ["link"],
    settings: {
      placeholder: { type: "string", label: "URL placeholder", default: "" },
      titlePlaceholder: { type: "string", label: "Title placeholder", default: "" },
    },
    class: "LinkDefaultWidget",
  },

  // Email widget
  {
    id: "email_default",
    label: "Email",
    fieldTypes: ["email"],
    settings: {
      size: { type: "number", label: "Size", default: 60 },
      placeholder: { type: "string", label: "Placeholder", default: "" },
    },
    class: "EmailDefaultWidget",
  },

  // Telephone widget
  {
    id: "telephone_default",
    label: "Telephone",
    fieldTypes: ["telephone"],
    settings: {
      size: { type: "number", label: "Size", default: 60 },
      placeholder: { type: "string", label: "Placeholder", default: "" },
    },
    class: "TelephoneDefaultWidget",
  },

  // URI widget
  {
    id: "uri",
    label: "URI",
    fieldTypes: ["uri"],
    settings: {
      size: { type: "number", label: "Size", default: 60 },
      placeholder: { type: "string", label: "Placeholder", default: "" },
    },
    class: "UriWidget",
  },

  // Password widget
  {
    id: "password_confirm",
    label: "Password with confirmation",
    fieldTypes: ["password"],
    settings: {},
    class: "PasswordConfirmWidget",
  },

  // Hidden widget
  {
    id: "hidden",
    label: "Hidden",
    fieldTypes: ["uuid", "computed", "password"],
    settings: {},
    class: "HiddenWidget",
  },

  // RSES widgets
  {
    id: "rses_classification_widget",
    label: "RSES Classification",
    fieldTypes: ["rses_classification"],
    settings: {
      showSets: { type: "boolean", label: "Show sets", default: true },
      showTopics: { type: "boolean", label: "Show topics", default: true },
      showTypes: { type: "boolean", label: "Show types", default: true },
      allowManualEdit: { type: "boolean", label: "Allow manual edit", default: false },
    },
    class: "RsesClassificationWidget",
  },
  {
    id: "rses_symlink_widget",
    label: "RSES Symlink",
    fieldTypes: ["rses_symlink"],
    settings: {
      showPath: { type: "boolean", label: "Show path", default: true },
    },
    class: "RsesSymlinkWidget",
  },
];

// Register all widgets
for (const w of coreWidgets) {
  widgets.set(w.id, w);
}

// =============================================================================
// FORMATTER DEFINITIONS
// =============================================================================

const formatters: Map<string, FormatterDefinition> = new Map();

const coreFormatters: FormatterDefinition[] = [
  // String formatters
  {
    id: "string",
    label: "Plain text",
    fieldTypes: ["string", "string_long", "uuid"],
    settings: {
      linkToEntity: { type: "boolean", label: "Link to entity", default: false },
    },
    class: "StringFormatter",
  },

  // Text formatters
  {
    id: "text_default",
    label: "Default",
    fieldTypes: ["text", "text_long", "text_with_summary"],
    settings: {},
    class: "TextDefaultFormatter",
  },
  {
    id: "text_summary_or_trimmed",
    label: "Summary or trimmed",
    fieldTypes: ["text_with_summary"],
    settings: {
      trimLength: { type: "number", label: "Trim length", default: 600 },
    },
    class: "TextSummaryOrTrimmedFormatter",
  },
  {
    id: "text_trimmed",
    label: "Trimmed",
    fieldTypes: ["text", "text_long", "text_with_summary"],
    settings: {
      trimLength: { type: "number", label: "Trim length", default: 600 },
    },
    class: "TextTrimmedFormatter",
  },

  // Number formatters
  {
    id: "number_integer",
    label: "Default",
    fieldTypes: ["integer"],
    settings: {
      thousandsSeparator: { type: "string", label: "Thousands separator", default: "" },
      prefix: { type: "string", label: "Prefix", default: "" },
      suffix: { type: "string", label: "Suffix", default: "" },
    },
    class: "NumberIntegerFormatter",
  },
  {
    id: "number_decimal",
    label: "Default",
    fieldTypes: ["decimal", "float"],
    settings: {
      thousandsSeparator: { type: "string", label: "Thousands separator", default: "" },
      decimalSeparator: { type: "string", label: "Decimal separator", default: "." },
      scale: { type: "number", label: "Decimal places", default: 2 },
      prefix: { type: "string", label: "Prefix", default: "" },
      suffix: { type: "string", label: "Suffix", default: "" },
    },
    class: "NumberDecimalFormatter",
  },

  // Boolean formatters
  {
    id: "boolean",
    label: "Default",
    fieldTypes: ["boolean"],
    settings: {
      trueLabel: { type: "string", label: "True label", default: "Yes" },
      falseLabel: { type: "string", label: "False label", default: "No" },
    },
    class: "BooleanFormatter",
  },

  // Date formatters
  {
    id: "datetime_default",
    label: "Default",
    fieldTypes: ["datetime", "timestamp"],
    settings: {
      format: { type: "string", label: "Date format", default: "medium" },
    },
    class: "DatetimeDefaultFormatter",
  },
  {
    id: "timestamp_ago",
    label: "Time ago",
    fieldTypes: ["timestamp"],
    settings: {},
    class: "TimestampAgoFormatter",
  },
  {
    id: "daterange_default",
    label: "Default",
    fieldTypes: ["daterange"],
    settings: {
      separator: { type: "string", label: "Separator", default: " - " },
      format: { type: "string", label: "Date format", default: "medium" },
    },
    class: "DaterangeDefaultFormatter",
  },

  // List formatters
  {
    id: "list_default",
    label: "Default",
    fieldTypes: ["list_string", "list_integer", "list_float"],
    settings: {},
    class: "ListDefaultFormatter",
  },
  {
    id: "list_key",
    label: "Key",
    fieldTypes: ["list_string", "list_integer", "list_float"],
    settings: {},
    class: "ListKeyFormatter",
  },

  // Entity reference formatters
  {
    id: "entity_reference_label",
    label: "Label",
    fieldTypes: ["entity_reference", "entity_reference_revisions", "taxonomy_term_reference"],
    settings: {
      link: { type: "boolean", label: "Link to entity", default: true },
    },
    class: "EntityReferenceLabelFormatter",
  },
  {
    id: "entity_reference_entity_id",
    label: "Entity ID",
    fieldTypes: ["entity_reference", "entity_reference_revisions", "taxonomy_term_reference"],
    settings: {},
    class: "EntityReferenceIdFormatter",
  },
  {
    id: "entity_reference_entity_view",
    label: "Rendered entity",
    fieldTypes: ["entity_reference", "entity_reference_revisions"],
    settings: {
      viewMode: { type: "string", label: "View mode", default: "teaser" },
    },
    class: "EntityReferenceEntityViewFormatter",
  },

  // File formatters
  {
    id: "file_default",
    label: "Generic file",
    fieldTypes: ["file"],
    settings: {},
    class: "FileDefaultFormatter",
  },
  {
    id: "file_table",
    label: "Table of files",
    fieldTypes: ["file"],
    settings: {},
    class: "FileTableFormatter",
  },

  // Image formatters
  {
    id: "image",
    label: "Image",
    fieldTypes: ["image"],
    settings: {
      imageStyle: { type: "string", label: "Image style", default: "" },
      imageLinkTo: { type: "select", label: "Link to", default: "", options: { "": "Nothing", content: "Content", file: "File" } },
    },
    class: "ImageFormatter",
  },

  // Link formatters
  {
    id: "link",
    label: "Link",
    fieldTypes: ["link"],
    settings: {
      trim: { type: "number", label: "Trim link text", default: 80 },
      rel: { type: "string", label: "Rel attribute", default: "" },
      target: { type: "select", label: "Target", default: "", options: { "": "Default", _blank: "New window" } },
    },
    class: "LinkFormatter",
  },

  // Email formatters
  {
    id: "email_mailto",
    label: "Email",
    fieldTypes: ["email"],
    settings: {},
    class: "EmailMailtoFormatter",
  },

  // Telephone formatters
  {
    id: "telephone_link",
    label: "Telephone link",
    fieldTypes: ["telephone"],
    settings: {},
    class: "TelephoneLinkFormatter",
  },

  // URI formatters
  {
    id: "uri_link",
    label: "URI link",
    fieldTypes: ["uri"],
    settings: {},
    class: "UriLinkFormatter",
  },

  // Hidden formatter
  {
    id: "hidden",
    label: "Hidden",
    fieldTypes: ["password", "uuid", "computed"],
    settings: {},
    class: "HiddenFormatter",
  },

  // Computed formatter
  {
    id: "computed",
    label: "Computed",
    fieldTypes: ["computed"],
    settings: {},
    class: "ComputedFormatter",
  },

  // RSES formatters
  {
    id: "rses_classification_default",
    label: "Default",
    fieldTypes: ["rses_classification"],
    settings: {
      displayStyle: { type: "select", label: "Display style", default: "badges", options: { badges: "Badges", list: "List", inline: "Inline" } },
      linkToTaxonomy: { type: "boolean", label: "Link to taxonomy", default: true },
    },
    class: "RsesClassificationFormatter",
  },
  {
    id: "rses_symlink_default",
    label: "Default",
    fieldTypes: ["rses_symlink"],
    settings: {
      showTarget: { type: "boolean", label: "Show target path", default: true },
    },
    class: "RsesSymlinkFormatter",
  },
];

// Register all formatters
for (const f of coreFormatters) {
  formatters.set(f.id, f);
}

// =============================================================================
// REGISTRY API
// =============================================================================

export const fieldTypeRegistry = {
  /**
   * Get all registered field types
   */
  getAll(): FieldTypeDefinition[] {
    return Array.from(fieldTypes.values());
  },

  /**
   * Get a specific field type
   */
  get(id: FieldType): FieldTypeDefinition | undefined {
    return fieldTypes.get(id);
  },

  /**
   * Get field types by category
   */
  getByCategory(category: FieldTypeDefinition["category"]): FieldTypeDefinition[] {
    return Array.from(fieldTypes.values()).filter((ft) => ft.category === category);
  },

  /**
   * Register a custom field type
   */
  register(definition: FieldTypeDefinition): void {
    fieldTypes.set(definition.id, definition);
  },
};

export const widgetRegistry = {
  /**
   * Get all registered widgets
   */
  getAll(): WidgetDefinition[] {
    return Array.from(widgets.values());
  },

  /**
   * Get a specific widget
   */
  get(id: string): WidgetDefinition | undefined {
    return widgets.get(id);
  },

  /**
   * Get widgets for a specific field type
   */
  getForFieldType(fieldType: FieldType): WidgetDefinition[] {
    return Array.from(widgets.values()).filter((w) =>
      w.fieldTypes.includes(fieldType)
    );
  },

  /**
   * Register a custom widget
   */
  register(definition: WidgetDefinition): void {
    widgets.set(definition.id, definition);
  },
};

export const formatterRegistry = {
  /**
   * Get all registered formatters
   */
  getAll(): FormatterDefinition[] {
    return Array.from(formatters.values());
  },

  /**
   * Get a specific formatter
   */
  get(id: string): FormatterDefinition | undefined {
    return formatters.get(id);
  },

  /**
   * Get formatters for a specific field type
   */
  getForFieldType(fieldType: FieldType): FormatterDefinition[] {
    return Array.from(formatters.values()).filter((f) =>
      f.fieldTypes.includes(fieldType)
    );
  },

  /**
   * Register a custom formatter
   */
  register(definition: FormatterDefinition): void {
    formatters.set(definition.id, definition);
  },
};
