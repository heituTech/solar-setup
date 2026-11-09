-- Staff self-registration goes through the approval queue. Registration requests
-- have no existing requester account yet, so requester_id must allow NULL.
ALTER TABLE approval_requests
  MODIFY COLUMN request_type ENUM('product_create','product_update','product_delete','account_create','account_update','account_delete','account_register') NOT NULL,
  MODIFY COLUMN requester_id INT NULL;
