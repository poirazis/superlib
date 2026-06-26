export const fieldComponentMap: Record<string, string> = {
	string: 'plugin/bb_component_SuperFieldText',
	number: 'plugin/bb_component_SuperFieldNumber',
	bigint: 'plugin/bb_component_SuperFieldNumber',
	options: 'plugin/bb_component_SuperFieldOption',
	array: 'plugin/bb_component_SuperFieldOptions',
	jsonarray: 'plugin/bb_component_SuperFieldArray',
	tags: 'plugin/bb_component_SuperFieldTags',
	color: 'plugin/bb_component_SuperFieldColor',
	icon: 'plugin/bb_component_SuperFieldIcon',
	boolean: 'plugin/bb_component_SuperFieldBoolean',
	longform: 'plugin/bb_component_SuperFieldText',
	datetime: 'plugin/bb_component_SuperFieldDatetime',
	link: 'plugin/bb_component_SuperFieldRelationship',
	sql_link: 'plugin/bb_component_SuperFieldSQLRelationship',
	json: 'plugin/bb_component_SuperFieldJSON',
	barcodeqr: 'codescanner',
	bb_reference_single: 'plugin/bb_component_SuperFieldRelationship',
	bb_reference: 'plugin/bb_component_SuperFieldRelationship',
	signature_single: 'signaturesinglefield',
	attachment_single: 'plugin/bb_component_SuperFieldAttachment',
	attachment: 'plugin/bb_component_SuperFieldAttachmentList'
};

export const specialFields = [
	'id',
	'createdAt',
	'createdBy',
	'updatedAt',
	'updatedBy',
	'owner',
	'created_by',
	'created_at',
	'updated_by',
	'updated_at',
	'deleted_by',
	'deleted_at',
	'owner_id'
];

export function getDefaultFieldComponent(): string {
	return 'plugin/bb_component_SuperFieldText';
}
