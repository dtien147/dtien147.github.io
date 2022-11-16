const docusign = require('docusign-esign');
const signingViaEmail = require('./signingViaEmail');
const fs = require('fs');
const path = require('path');
const prompt = require('prompt-sync')();

const jwtConfig = require('./jwtConfig.json');
const { ProvisioningInformation } = require('docusign-esign');
const demoDocsPath = path.resolve(__dirname, '../demo_documents');
const doc2File = 'World_Wide_Corp_Battle_Plan_Trafalgar.docx';
const doc3File = 'World_Wide_Corp_lorem.pdf';


const SCOPES = [
     "signature", "impersonation"
];

function getConsent() {
  var urlScopes = SCOPES.join('+');

  // Construct consent URL
  var redirectUri = "https://developers.docusign.com/platform/auth/consent";
  var consentUrl = `${jwtConfig.dsOauthServer}/oauth/auth?response_type=code&` +
                      `scope=${urlScopes}&client_id=${jwtConfig.dsJWTClientId}&` +
                      `redirect_uri=${redirectUri}`;

  console.log("Open the following URL in your browser to grant consent to the application:");
  console.log(consentUrl);
  console.log("Consent granted? \n 1)Yes \n 2)No");
  let consentGranted = prompt("");
  if(consentGranted == "1"){
    return true;
  } else {
    console.error("Please grant consent!");
    process.exit();
  }
}

async function authenticate(){
  const jwtLifeSec = 10 * 60, // requested lifetime for the JWT is 10 min
    dsApi = new docusign.ApiClient();
  dsApi.setOAuthBasePath(jwtConfig.dsOauthServer.replace('https://', '')); // it should be domain only.
  let rsaKey = fs.readFileSync(jwtConfig.privateKeyLocation);

  try {
    const results = await dsApi.requestJWTUserToken(jwtConfig.dsJWTClientId,
      jwtConfig.impersonatedUserGuid, SCOPES, rsaKey,
      jwtLifeSec);
    const accessToken = results.body.access_token;

    // get user info
    const userInfoResults = await dsApi.getUserInfo(accessToken);

    // use the default account
    let userInfo = userInfoResults.accounts.find(account =>
      account.isDefault === "true");

    return {
      accessToken: results.body.access_token,
      apiAccountId: userInfo.accountId,
      basePath: `${userInfo.baseUri}/restapi`
    };
  } catch (e) {
    console.log(e);
    let body = e.response && e.response.body;
    // Determine the source of the error
    if (body) {
        // The user needs to grant consent
      if (body.error && body.error === 'consent_required') {
        if (getConsent()){ return authenticate(); };
      } else {
        // Consent has been granted. Show status code for DocuSign API error
        this._debug_log(`\nAPI problem: Status code ${e.response.status}, message body:
        ${JSON.stringify(body, null, 4)}\n\n`);
      }
    }
  }
}

function makeEnvelope(args){
  let signer1 = docusign.Signer.constructFromObject({
          email: args.signerEmail,
          name: args.signerName, 
          roleName: "signer",
          recipientId: "1",
          // Adding clientUserId transforms the template recipient
          // into an embedded recipient:
          clientUserId: args.signerClientId 
      });
  // Create the cc recipient
  let cc1 = docusign.CarbonCopy.constructFromObject({
      email: args.ccEmail,
      name: args.ccName, 
      roleName: "cc",
      recipientId: "2"
  });
  // Recipients object:
  let recipientsServerTemplate = docusign.Recipients.constructFromObject({
      carbonCopies: [cc1], signers: [signer1], });

  // create a composite template for the Server Template
  let compTemplate1 = docusign.CompositeTemplate.constructFromObject({
        compositeTemplateId: "1",
        serverTemplates: [
            docusign.ServerTemplate.constructFromObject({
                sequence: "1",
                templateId: "822668b2-7f9b-4018-b9fc-ee0733d9ec9b"                   
            })
        ],
        // Add the roles via an inlineTemplate
        inlineTemplates: [
            docusign.InlineTemplate.constructFromObject({
                sequence: "2",
                recipients: recipientsServerTemplate
            })
        ]
  })

  // The signer recipient for the added document with
  // a tab definition:
  let signHere1 = docusign.SignHere.constructFromObject({
      anchorString: '**signature_1**',
      anchorYOffset: '10', anchorUnits: 'pixels',
      anchorXOffset: '20'})
  ;
  let signer1Tabs = docusign.Tabs.constructFromObject({
      signHereTabs: [signHere1]});

  // Signer definition for the added document
  let signer1AddedDoc = docusign.Signer.constructFromObject({
      email: args.signerEmail,
      name: args.signerName,
      clientId: args.signerClientId,
      roleName: "signer",
      recipientId: "1",
      tabs: signer1Tabs
  });
  // Recipients object for the added document:
  let recipientsAddedDoc = docusign.Recipients.constructFromObject({
      carbonCopies: [cc1], signers: [signer1AddedDoc]});
  // create the HTML document
  let doc1 = new docusign.Document()
    , doc1b64 = Buffer.from(document1(args)).toString('base64');
  doc1.documentBase64 = doc1b64;
  doc1.name = 'Appendix 1--Sales order'; // can be different from actual file name
  doc1.fileExtension = 'html';
  doc1.documentId = '1';

  // create a composite template for the added document
  let compTemplate2 = docusign.CompositeTemplate.constructFromObject({
      compositeTemplateId: "2",
      // Add the recipients via an inlineTemplate
      inlineTemplates: [
          docusign.InlineTemplate.constructFromObject({
              sequence: "1",
              recipients: recipientsAddedDoc
          })
      ],
      document: doc1
  })

  // create the envelope definition
  let env = docusign.EnvelopeDefinition.constructFromObject({
      status: "sent",
      compositeTemplates: [compTemplate1, compTemplate2]
  })

  return env;
}

function document1(args) {

  return `
  <!DOCTYPE html>
  <html>
      <head>
        <meta charset="UTF-8">
      </head>
      <body style="font-family:sans-serif;margin-left:2em;">
      <h1 style="font-family: 'Trebuchet MS', Helvetica, sans-serif;
          color: darkblue;margin-bottom: 0;">World Wide Corp</h1>
      <h2 style="font-family: 'Trebuchet MS', Helvetica, sans-serif;
        margin-top: 0px;margin-bottom: 3.5em;font-size: 1em;
        color: darkblue;">Order Processing Division</h2>
      <h4>Ordered by ${args.signerName}</h4>
      <p style="margin-top:0em; margin-bottom:0em;">Email: ${args.signerEmail}</p>
      <p style="margin-top:0em; margin-bottom:0em;">Copy to: ${args.ccName}, ${args.ccEmail}</p>
      <p style="margin-top:3em; margin-bottom:0em;">Item: <b>${args.item}</b>, quantity: <b>${args.quantity}</b> at market price.</p>
      <p style="margin-top:3em;">
Candy bonbon pastry jujubes lollipop wafer biscuit biscuit. Topping brownie sesame snaps sweet roll pie. Croissant danish biscuit soufflé caramels jujubes jelly. Dragée danish caramels lemon drops dragée. Gummi bears cupcake biscuit tiramisu sugar plum pastry. Dragée gummies applicake pudding liquorice. Donut jujubes oat cake jelly-o. Dessert bear claw chocolate cake gummies lollipop sugar plum ice cream gummies cheesecake.
      </p>
      <!-- Note the anchor tag for the signature field is in white. -->
      <h3 style="margin-top:3em;">Agreed: <span style="color:white;">**signature_1**/</span></h3>
      </body>
  </html>
`
}

function getArgs(apiAccountId, accessToken, basePath){
  signerEmail = 'test@example.com';
  signerName = 'test';
  ccEmail = 'test@example.com';
  ccName = 'test';

  const envelopeArgs = {
    signerEmail: signerEmail,
    signerName: signerName,
    ccEmail: ccEmail,
    ccName: ccName,
    status: "sent",
    doc2File: path.resolve(demoDocsPath, doc2File),
    doc3File: path.resolve(demoDocsPath, doc3File)
  };
  const args = {
    accessToken: accessToken,
    basePath: basePath,
    accountId: apiAccountId,
    envelopeArgs: envelopeArgs,
    dsReturnUrl: 'http://localhost:3000'
  };

  return args;
}

async function createView(args, envelopesApi) {
  // Create the recipient view, the Signing Ceremony
  let viewRequest = makeRecipientViewRequest(args.envelopeArgs);
  // Call the CreateRecipientView API
  // Exceptions will be caught by the calling function
  results = await envelopesApi.createRecipientView(
  args.accountId, args.envelopeId,{recipientViewRequest: viewRequest});

  return results.url;
}

function makeRecipientViewRequest(args) {
  // Data for this method
  // args.dsReturnUrl
  // args.signerEmail
  // args.signerName
  // args.signerClientId
  // args.dsPingUrl


  let viewRequest = new docusign.RecipientViewRequest();

  // Set the url where you want the recipient to go once they are done signing
  // should typically be a callback route somewhere in your app.
  viewRequest.returnUrl = 'http://localhost:3000';

  // How has your app authenticated the user? In addition to your app's
  // authentication, you can include authenticate steps from DocuSign.
  // Eg, SMS authentication
  viewRequest.authenticationMethod = 'none';

  // Recipient information must match embedded recipient info
  // we used to create the envelope.
  viewRequest.email = args.signerEmail;
  viewRequest.userName = args.signerName;
  viewRequest.clientUserId = args.signerClientId;
  return viewRequest;
}

async function main(){
  let accountInfo = await authenticate();
  let args = getArgs(accountInfo.apiAccountId, accountInfo.accessToken, accountInfo.basePath);
  // let envelopeId = signingViaEmail.sendEnvelope(args);


  let dsApiClient = new docusign.ApiClient();
  dsApiClient.setBasePath(args.basePath);
  dsApiClient.addDefaultHeader('Authorization', 'Bearer ' + args.accessToken);
  let envelopesApi = new docusign.EnvelopesApi(dsApiClient);

  // Make the envelope request body
  let envelope = makeEnvelope(args.envelopeArgs)
  // console.log(`Args was init. Args ${JSON.stringify(envelope)}`);
  // console.log(`Envelope was init. Envelope ${JSON.stringify(envelope)}`);


  // Call Envelopes::create API method
  // Exceptions will be caught by the calling function
  let results = await envelopesApi.createEnvelope(
      args.accountId, {envelopeDefinition: envelope});
  
  let envelopeId = results.envelopeId;
  console.log(`Envelope was created. EnvelopeId ${envelopeId}`);
  args.envelopeId = envelopeId;

  const view = await createView(args, envelopesApi);

  console.log(`View created. EnvelopeId ${view}`);
}

main();