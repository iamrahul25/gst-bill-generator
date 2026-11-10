IN GST BILL Section



**Main Page TOP Section:** 

* Select business dropdown with + New Register option (Only these two option can be use to enter business details we cannot directly enter business details on MAIN Page, FIRST We should register then select)  



* Select business dropdown: it will show us a list of business registered in that if there are a lot of businesses also provide kind of search option which works on basis of business name, also each registered business also have a edit Option (EDIT option cannot ALLOW to edit GSTIN \& Business Name) 


**New Button working:** When click on new a Micro page appear IN WHICH it should contain following fields:



* A Business Details Section Contains following info: 

  1. GSTIN (Mandatory Cannot be editable once registered)
  2. Business Name (Mandatory Cannot be editable once registered)
  3. Address
  4. City
  5. State
  6. PIN Code
  7. PAN
  8. Email (can be more the one)
  9. Phone Number (At least one Mandatory)



* Payment Details Section Contain Following Info: 

  1. Account Name
  2. Bank Name
  3. Account Number
  4. IFSC Code
  5. Branch
  6. UPI ID



\*\*Once Save a data source for that specific GSTIN a data source will be created to keep the records of invoice numbers attached to that specific GSTIN. Then suppose if we again trying to create a new business and put same GST number it should Not allow and give a error that this GST number is already stored with (Business Name of that) 



Also similar to business details there should be a option to selected already registered customer details also a NEW option to add new customer details, Customer details can be directly enter on main page (details entered on main should not automatic save in registered customer details), We can also select new to enter customer details there we can save that details local storage only. 


**New Option should contain:** 

1. Customer Name (Mandatory)
2. Phone Number (Mandatory)
3. Address
4. City
5. State
6. PIN Code
7. GSTIN(optional) : For this GST No. do not need to create any data source its just and optional field if the customer has GST No we can fill otherwise ignore.



\*\*Customer Details also has the option to edit and delete we can change each and every field



\*\*Now If a customer is selected from List that details should came and also keep customer Name and Phone Number Mandatory on the Main Page in case we are entering details of a customer which we don't want to save.



Now "Invoice Date" Field on invoice section should be load empty and also MANDATORY and Bill must contain at least 1 item that is also a mandatory thing. 

"INVOICE NO" Field on invoice section will be empty with a text message Number will generate after you save this bill. That Number should not be editable also once generated. 



Now for the Each Bill at on load (When there is nothing selected) user have options to Preview, Save and NEW BILL



* **Preview Function:** Do not save the data and also do not able to print that only give a preview of how it looks in pdf it can ignore the required fields during preview time. 

* **SAVE FUNCTION:** This Button Only works if user had filled each and every MANDATORY Fields.
Then It will First Ask the user if he want to save the bill confirm check box with a message Once saved this bill will only allowed to Finish, edit and Cancel in the SAVED Bills Area of application. You can never able to delete this bill. 
Once Confirmed and all the mandatory fields are filled after that a invoice number will be generated for that specific Bill Pattern for invoice number will be: 

Pattern : Business Name Each Word First Letter/Year(Based on invoice Date)/Month (Based on invoice Date)/0001
Example: 
business name = Shri Prabhu Ply
For this first invoice number if generated in Nov month of 2026 will be: SPP/2026/11/0001
Second invoice number will be if month is still Nov: SPP/2026/11/0002 
Second invoice number if month is changed to Dec: SPP/2026/12/0001 

Like this for a month count will continue to increase by 1 and if month changes count will get back 0001 and the increase +1 according to number of bill generated in that month.

Once that invoice number is available show it at the main page save every information currently mentioned in the bill

\* **MOST IMP POINT:** INVOICE NUMBER AND ALERT WILL only be provided when a New Bill Is saved for the first time after that only the data will be get saved No new invoice number will be generated for same bill and that bill will also become NON DELETABLE after that

* **NEW BILL FUNCTION:** It Will refresh the main page with empty fields. Suppose you have filled some data on main page now, you did not pressed save yet, after that if you press NEW BILL then that bill info will not be saved. It MUST only save when use press save button and IF that bill is already saved then NEW BILL Button will refresh the main page with empty fields and that bill can be found in the saved section. User can go to saved bills and can edit, Finish or cancel the bill.

* \*\*There is PRINT Option that will display only after USER at least saved the details one time and a invoice number is generated for that bill, then this print button will save all the latest details entered and provide a pdf for that bill.



**NOW about saved bills area:** 

* There should be a button on main page that will take us to all the saved bills.
* Saved Bill Section basically divided in 3 groups FINISHED BILL, UNFINISHED BILLS, CANCEL BILLS.



1. UNFINISHED BILLS: Whenever a new bill is saved from main page it will directly came to this section user will FIND 4 options PRINT, EDIT, CANCEL AND FINISH


   * **EDIT:** will open the bill with all the saved details and Save and Discard button, in which user cannot change Business GSTIN, Business Name, INVOICE NO, INVOICE DATE except for these 4 Fields user can change any other field as per his requirements and press save a dialogue box appear to ask if you want to save if save pressed it will save all the changes made or if he did not want to save just press discard or simply going back from edit page that will also discard the changes.

   * **CANCEL:** THIS button on UNFINISHED BILLS will open a EDIT LIKE Page that at top will contain a cancel Details section which will have a option to select cancel reason with 4 options: DATA ENTRY Mistake, Order Cancel by buyer, Duplicate Entry, Other. And a text box will also be available where user can enter a proper reason to why he cancelled the bill. And below that all the bill details will be there in un-editable mode (we cannot make a change to any of the field in that area). There will be a option to Mark as cancel or discard changes. Mark as cancel will move the bill to cancel Bills section with saving all the cancel reason, with extra field cancel time and date (that will be added when user mark those bill as cancel use that time and date as per India)

Discard or simply pressing back button will discard all the changes done and reload the unfinished section.

   * **FINISH:** Once clicked a micro dialogue box appear to ask for confirmation if you want to finalize the bill once finalize you wont be able to edit it again. once done finalize bill will be moved to finalize section.

   * **PRINT:** Simply Generate a pdf for that bill

2. **FINISHED BILL:** This area will contain all the bills that are marked as Finish are there will 2 option Cancel and PRINT both the option will DO same work as they do in UNFINISHED BILLS

3. **Cancelled Bills:** This will contain 2 option PRINT and Move to Unfinished bills.

   * **Move to unfinished bills:** Ask for confirmation if user want to move the bill to unfinished bill or not. Simply move the bill will all the details to unfinished bill section and remove the cancel section (which contains reason date and time of cancellation) from the bill 

   * **PRINT:** Will print the bill normally as it do but also add a CANCELLED WATERMARK ON THE BILL PAGES and also add a new page in the end that will contain the cancel reason date and time.



