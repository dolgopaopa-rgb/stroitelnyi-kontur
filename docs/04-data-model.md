# Черновая модель данных

## User

- id
- name
- role
- phone
- email
- is_active

## Project

- id
- title
- status
- customer_name
- customer_contacts
- address
- navigator_url
- bitrix_url
- smetter_url
- construction_manager_id
- foreman_id
- estimator_id
- procurement_manager_id
- planned_start_date
- planned_end_date
- actual_start_date
- actual_end_date
- created_at
- updated_at

## Contract

- id
- project_id
- type
- counterparty
- number
- signed_at
- starts_at
- ends_at
- amount
- responsible_user_id
- status
- file_id
- parent_contract_id
- smetter_url
- created_at
- updated_at

## Document

- id
- project_id
- contract_id
- variation_id
- type
- title
- version
- file_id
- author_id
- responsible_user_id
- document_date
- due_date
- status
- smetter_url
- created_at
- updated_at

## Task

- id
- project_id
- title
- description
- creator_id
- assignee_id
- due_date
- priority
- status
- related_type
- related_id
- created_at
- updated_at

## MaterialRequest

- id
- project_id
- creator_id
- contract_id
- variation_id
- estimate_section
- basis_type
- needed_at
- status
- procurement_status
- smetter_status
- supplier_id
- invoice_document_id
- total_amount
- comment
- created_at
- updated_at

## MaterialRequestItem

- id
- material_request_id
- name
- quantity
- unit
- estimated_quantity
- estimated_price
- actual_price
- comment

## Variation

Variation means additional work, overspend, replacement, hidden work, warranty cost or other deviation from the approved estimate.

- id
- project_id
- type
- title
- description
- initiator_id
- reason
- estimate_section
- estimated_amount
- final_amount
- approval_due_date
- execution_due_date
- responsible_user_id
- status
- financial_decision
- contract_id
- document_id
- act_document_id
- smetter_url
- created_at
- updated_at

## PhotoReport

- id
- project_id
- author_id
- report_date
- work_stage
- zone
- comment
- visible_to_customer
- related_type
- related_id
- created_at

## Photo

- id
- photo_report_id
- file_id
- caption
- created_at

## Supplier

- id
- name
- category
- address
- navigator_url
- contact_name
- contact_phone
- terms
- notes
- is_active

## Reminder

- id
- related_type
- related_id
- responsible_user_id
- remind_at
- type
- status
- created_at
- sent_at

## Status dictionaries

### Project.status

- transferred_to_construction
- preparation
- in_progress
- paused
- acceptance
- document_closing
- completed
- archived

### Contract.status

- draft
- active
- expiring_soon
- expired
- extended
- closed

### MaterialRequest.basis_type

- main_estimate
- main_estimate_overspend
- material_replacement
- additional_work
- additional_agreement
- over_budget_cost
- warranty_work
- internal_error_or_loss

### MaterialRequest.procurement_status

- new
- clarification
- approval
- ordered
- delivery
- delivered
- closed
- problem
- cancelled

### MaterialRequest.smetter_status

- not_required
- waiting_to_enter
- entered
- included_in_act
- error
- needs_review

### Variation.type

- additional_work
- material_overspend
- material_replacement
- hidden_work
- estimate_error
- customer_change
- company_cost
- disputed_position

### Variation.status

- detected
- decision_required
- estimator_review
- estimate_ready
- approval
- approved
- rejected
- in_progress
- completed
- included_in_separate_act
- written_off_company_cost
- closed

### Variation.financial_decision

- customer
- company
- contractor
- disputed
- not_decided

