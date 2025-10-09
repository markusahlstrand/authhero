import{j as e,F as Te,c as x,E as Le,d as He,r as u,a as h,H as g}from"./adapter-interfaces-DLDVgf18.js";import{h as Me}from"./index-CvWD-_Qu.js";import{i as c}from"./iframe-ClqLvtKn.js";import"./preload-helper-C1FmrZbK.js";const _e=({theme:t,branding:n})=>{var o;const r=((o=t==null?void 0:t.widget)==null?void 0:o.logo_url)||(n==null?void 0:n.logo_url);return r?e("div",{className:"flex h-9 items-center",children:e("img",{src:r,className:"max-h-full",alt:"Logo"})}):e(Te,{})};_e.__docgenInfo={description:"",methods:[],displayName:"AppLogo"};const be=t=>{var n,r;return e("div",{className:"mt-8",children:((r=(n=t.client)==null?void 0:n.client_metadata)==null?void 0:r.termsAndConditionsUrl)&&e("div",{className:"text-xs text-gray-300",children:[c.t("agree_to")," ",e("a",{href:t.client.client_metadata.termsAndConditionsUrl,className:"text-primary hover:underline",target:"_blank",rel:"noreferrer",children:c.t("terms")})]})})};be.__docgenInfo={description:"",methods:[],displayName:"Footer",props:{theme:{required:!0,tsType:{name:"union",raw:"Theme | null",elements:[{name:"Theme"},{name:"null"}]},description:""},branding:{required:!0,tsType:{name:"union",raw:"Branding | null",elements:[{name:"Branding"},{name:"null"}]},description:""},client:{required:!0,tsType:{name:"union",raw:"LegacyClient | null",elements:[{name:"LegacyClient"},{name:"null"}]},description:""}}};const Oe=t=>t==="small"?"text-base":t==="medium"?"text-2xl":t==="large"?"text-3xl":"",y=({name:t,size:n,className:r=""})=>{const o=Oe(n);return e("span",{className:x(`uicon-${t}`,r,o)})};y.__docgenInfo={description:"",methods:[],displayName:"Icon",props:{name:{required:!0,tsType:{name:"string"},description:""},size:{required:!1,tsType:{name:"union",raw:'"small" | "medium" | "large"',elements:[{name:"literal",value:'"small"'},{name:"literal",value:'"medium"'},{name:"literal",value:'"large"'}]},description:""},className:{required:!1,tsType:{name:"string"},description:"",defaultValue:{value:'""',computed:!1}}}};const Be=(t,n)=>{const r=t.replace("#",""),o=parseInt(r,16),a=o>>16&255,s=o>>8&255,l=o&255,i=Math.min(255,Math.round(a+(255-a)*n)),d=Math.min(255,Math.round(s+(255-s)*n)),k=Math.min(255,Math.round(l+(255-l)*n));return`#${(i<<16|d<<8|k).toString(16).padStart(6,"0")}`};var z=Object.freeze,Fe=Object.defineProperty,Ee=(t,n)=>z(Fe(t,"raw",{value:z(t.slice())})),W;const je=(t,n)=>{var s,l,i,d;const r=((s=t==null?void 0:t.colors)==null?void 0:s.primary_button)||((l=n==null?void 0:n.colors)==null?void 0:l.primary)||"#000000",o=((i=t==null?void 0:t.colors)==null?void 0:i.base_hover_color)||Be(r,.2),a=((d=t==null?void 0:t.colors)==null?void 0:d.primary_button_label)||"#ffffff";return`
    body {
      --primary-color: ${r};
      --primary-hover: ${o};
      --text-on-primary: ${a};
    }
  `},qe="https://assets.sesamy.com/images/login-bg.jpg",ye=({title:t,children:n,theme:r,branding:o,client:a})=>{var l;const s={backgroundImage:`url(${((l=r==null?void 0:r.page_background)==null?void 0:l.background_image_url)||qe})`};return e("html",{lang:"en",children:[e("head",{children:[e("title",{children:t}),e("meta",{charset:"UTF-8"}),e("meta",{name:"robots",content:"noindex, follow"}),e("link",{rel:"preload",href:"https://assets.sesamy.com/fonts/khteka/WOFF2/KHTeka-Regular.woff2",as:"font",type:"font/woff2",crossOrigin:"anonymous"}),e("link",{rel:"preload",href:"https://assets.sesamy.com/fonts/khteka/WOFF2/KHTeka-Medium.woff2",as:"font",type:"font/woff2",crossOrigin:"anonymous"}),e("link",{rel:"preload",href:"https://assets.sesamy.com/fonts/khteka/WOFF2/KHTeka-Bold.woff2",as:"font",type:"font/woff2",crossOrigin:"anonymous"}),e("link",{rel:"stylesheet",href:"/u/css/tailwind.css"}),e("meta",{name:"viewport",content:"width=device-width, initial-scale=1, maximum-scale=1"}),e("style",{children:je(r,o)}),e("meta",{name:"theme-color",content:"#000000"})]}),e("body",{children:e("div",{className:"row min-h-full w-full overflow-hidden bg-cover bg-center text-sm sm:bg-fixed sm:bg-left-top sm:pt-16 py-2",style:s,children:e("div",{className:"row-up-left w-[calc(100%-theme(space.2)-theme(space.2))] max-w-[1295px] !flex-nowrap sm:w-[calc(100%-theme(space.16)-theme(space.16))]",children:e("div",{className:"column-left w-full sm:w-auto",children:[e("div",{className:"relative flex w-full flex-col rounded-2xl bg-white px-5 py-10 dark:bg-gray-800 dark:text-white sm:min-h-[700px] sm:max-w-md sm:px-14 sm:py-14 md:min-w-[448px] short:min-h-[558px] min-h-[calc(100vh-83px)]",children:[e("div",{className:"mb-16",children:e(_e,{theme:r,branding:o})}),e("div",{className:"flex flex-1 flex-col",children:[n,e(be,{theme:r,branding:o,client:a})]})]}),e("div",{className:"flex w-full items-center px-6 pb-8 pt-4 justify-between",children:[e("div",{className:"flex justify-center leading-[0]",children:e("a",{href:"https://sesamy.com",target:"_blank",rel:"noreferrer",children:e(y,{name:"sesamy",className:"text-xl text-white"})})}),e("div",{className:"flex justify-center space-x-2 text-xs text-white sm:justify-normal md:text-xs"})]})]})})})}),Me(W||(W=Ee([`
        <script>
          // Add loading class to submit button on form submission
          document.addEventListener("DOMContentLoaded", function () {
            var form = document.getElementById("form");
            if (form) {
              var submitBtn = form.querySelector("button[type=submit]");
              if (submitBtn) {
                form.onsubmit = function () {
                  submitBtn.classList.add("is-loading");
                };
                // Remove loading class if the page is loaded from browser bfcache
                window.addEventListener("pageshow", function (event) {
                  if (event.persisted) {
                    submitBtn.classList.remove("is-loading");
                  }
                });
              }
            }
          });
        <\/script>
      `])))]})};ye.__docgenInfo={description:"",methods:[],displayName:"Layout"};const ze=t=>t==="small"?"text-base":t==="medium"?"text-2xl":t==="large"?"text-3xl":"",xe=({size:t})=>{const n=ze(t);return e("div",{className:"relative inline-block leading-[0]",children:[e(y,{className:x("text-gray-200 dark:text-[#201a41]",{[n]:n}),name:"spinner-circle"}),e(y,{className:x("absolute inset-0 animate-spin text-primary",{[n]:n}),name:"spinner-inner"})]})};xe.__docgenInfo={description:"",methods:[],displayName:"Spinner",props:{size:{required:!1,tsType:{name:"union",raw:'"small" | "medium" | "large"',elements:[{name:"literal",value:'"small"'},{name:"literal",value:'"medium"'},{name:"literal",value:'"large"'}]},description:""}}};const B=({children:t,className:n,Component:r="button",variant:o="primary",href:a,disabled:s,isLoading:l,id:i})=>{const d=r==="a"?{href:a}:{};return e(r,{class:x("btn relative w-full rounded-lg text-center",{"px-4 py-5":o!=="custom","bg-primary text-textOnPrimary hover:bg-primaryHover":o==="primary","border border-gray-300 bg-white text-black":o==="secondary","pointer-events-none cursor-not-allowed opacity-40":s,"is-loading":l},"focus:outline-none focus:ring",n),type:"submit",disabled:s,id:i,...d,children:[e("span",{className:"btn-label flex items-center justify-center space-x-2",children:t}),e("div",{className:"btn-spinner absolute left-0 top-0 flex h-full w-full items-center justify-center",children:e(xe,{size:"medium"})})]})};B.__docgenInfo={description:"",methods:[],displayName:"Button",props:{Component:{defaultValue:{value:'"button"',computed:!1},required:!1},variant:{defaultValue:{value:'"primary"',computed:!1},required:!1}}};const w=({connection:t,text:n,icon:r=null,canResize:o=!1,loginSession:a})=>{const s=new URLSearchParams({client_id:a.authParams.client_id,connection:t});a.authParams.response_type&&s.set("response_type",a.authParams.response_type),a.authParams.redirect_uri&&s.set("redirect_uri",a.authParams.redirect_uri),a.authParams.scope&&s.set("scope",a.authParams.scope),a.authParams.nonce&&s.set("nonce",a.authParams.nonce),a.authParams.response_type&&s.set("response_type",a.authParams.response_type),a.authParams.state&&s.set("state",a.id);const l=`/authorize?${s.toString()}`;return e(B,{className:x("border border-gray-200 bg-white hover:bg-gray-100 dark:border-gray-400 dark:bg-black dark:hover:bg-black/90",{"px-0 py-3 sm:px-10 sm:py-4 short:px-0 short:py-3":o,"px-10 py-3":!o}),variant:"custom","aria-label":n,Component:"a",href:l,children:[r||"",e("div",{className:x("text-left text-black dark:text-white sm:text-base",{"hidden sm:inline short:hidden":o}),children:n})]})};w.__docgenInfo={description:"",methods:[],displayName:"SocialButton",props:{connection:{required:!0,tsType:{name:"union",raw:'"google-oauth2" | "apple" | "facebook" | "vipps"',elements:[{name:"literal",value:'"google-oauth2"'},{name:"literal",value:'"apple"'},{name:"literal",value:'"facebook"'},{name:"literal",value:'"vipps"'}]},description:""},icon:{required:!1,tsType:{name:"any"},description:"",defaultValue:{value:"null",computed:!1}},text:{required:!0,tsType:{name:"string"},description:""},canResize:{required:!1,tsType:{name:"boolean"},description:"",defaultValue:{value:"false",computed:!1}},loginSession:{required:!0,tsType:{name:"LoginSession"},description:""}}};const we=({...t})=>e("svg",{width:"45",height:"45",viewBox:"0 0 45 45",xmlns:"http://www.w3.org/2000/svg",...t,children:[e("path",{d:"M44.1035 23.0123C44.1054 21.4791 43.9758 19.9486 43.716 18.4375H22.498V27.1028H34.6507C34.4021 28.4868 33.8757 29.8061 33.1034 30.9812C32.3311 32.1562 31.3289 33.1628 30.1571 33.9401V39.5649H37.41C41.6567 35.6494 44.1035 29.859 44.1035 23.0123Z",fill:"#4285F4"}),e("path",{d:"M22.4982 44.9997C28.5698 44.9997 33.6821 43.0061 37.4101 39.5687L30.1573 33.9439C28.1386 35.3126 25.5387 36.0938 22.4982 36.0938C16.6296 36.0938 11.6485 32.1377 9.86736 26.8066H2.39575V32.6033C4.26839 36.3297 7.13989 39.4622 10.6896 41.6512C14.2394 43.8402 18.3277 44.9995 22.4982 44.9997Z",fill:"#34A853"}),e("path",{d:"M9.86737 26.8073C8.92572 24.0138 8.92572 20.9886 9.86737 18.1951V12.3984H2.39576C0.820432 15.5332 0 18.9929 0 22.5012C0 26.0095 0.820432 29.4692 2.39576 32.604L9.86737 26.8073Z",fill:"#FBBC04"}),e("path",{d:"M22.4982 8.90741C25.7068 8.85499 28.8071 10.0673 31.1291 12.2823L37.5507 5.86064C33.4788 2.03602 28.0843 -0.0637686 22.4982 0.00147616C18.3277 0.00166623 14.2394 1.16098 10.6896 3.34999C7.13989 5.539 4.26839 8.67155 2.39575 12.3979L9.86736 18.1946C11.6485 12.8635 16.6296 8.90741 22.4982 8.90741Z",fill:"#EA4335"})]});we.__docgenInfo={description:"",methods:[],displayName:"Google"};const ke=({children:t,className:n})=>e("form",{id:"form",method:"post",className:n,children:t});ke.__docgenInfo={description:"",methods:[],displayName:"FormComponent"};const ve=({...t})=>e("svg",{version:"1.1",id:"Layer_1",xmlns:"http://www.w3.org/2000/svg",x:"0px",y:"0px",viewBox:"0 0 48 48",enableBackground:"new 0 0 48 48",width:"45",height:"45",...t,children:[e("path",{fill:"#FF5B24",d:"M3.5,8h41c1.9,0,3.5,1.6,3.5,3.5v25c0,1.9-1.6,3.5-3.5,3.5h-41C1.6,40,0,38.4,0,36.5v-25C0,9.6,1.6,8,3.5,8z"}),e("path",{fillRule:"evenodd",clipRule:"evenodd",fill:"#FFFFFF",d:`M27.9,20.3c1.4,0,2.6-1,2.6-2.5h0c0-1.5-1.2-2.5-2.6-2.5c-1.4,0-2.6,1-2.6,2.5C25.3,19.2,26.5,20.3,27.9,20.3z
    M31.2,24.4c-1.7,2.2-3.5,3.8-6.7,3.8h0c-3.2,0-5.8-2-7.7-4.8c-0.8-1.2-2-1.4-2.9-0.8c-0.8,0.6-1,1.8-0.3,2.9
   c2.7,4.1,6.5,6.6,10.9,6.6c4,0,7.2-2,9.6-5.2c0.9-1.2,0.9-2.5,0-3.1C33.3,22.9,32.1,23.2,31.2,24.4z`})]});ve.__docgenInfo={description:"",methods:[],displayName:"VippsLogo"};const m=({error:t,theme:n,branding:r,loginSession:o,email:a,client:s})=>{const l=s.connections.map(({strategy:Ie})=>Ie),i=l.includes("email")||l.includes("Username-Password-Authentication"),d=l.includes("sms"),k=l.includes("facebook"),O=l.includes("google-oauth2"),F=l.includes("apple"),E=l.includes("vipps"),Se=k||O||F||E,j=i||d;let Ce="text",Ne="username";const q=i&&d?"email_or_phone_placeholder":i?"email_placeholder":"phone_placeholder";let Pe=c.t(q,i&&d?"Email or Phone Number":i?"Email Address":"Phone Number");return e(ye,{title:c.t("welcome"),theme:n,branding:r,client:s,children:[e("div",{className:"mb-4 text-lg font-medium sm:text-2xl",children:c.t("welcome")}),e("div",{className:"mb-8 text-gray-300",children:c.t("login_description_template",{authMethod:c.t(q,{defaultValue:i&&d?"email or phone number":i?"email address":"phone number"}).toLocaleLowerCase(),defaultValue:"Sign in with your {{authMethod}}"})}),e("div",{className:"flex flex-1 flex-col justify-center",children:[j&&e(ke,{className:"mb-7",children:[e("input",{type:Ce,name:Ne,placeholder:Pe,className:x("mb-2 w-full rounded-lg border bg-gray-100 px-4 py-5 text-base placeholder:text-gray-300 dark:bg-gray-600 md:text-base",{"border-red":t,"border-gray-100 dark:border-gray-500":!t}),required:!0,value:a||""}),t&&e(Le,{children:t}),e(B,{className:"sm:mt-4 !text-base",children:[e("span",{children:c.t("continue")}),e(y,{className:"text-xs",name:"arrow-right"})]})]}),j&&Se&&e("div",{className:"relative mb-5 block text-center text-gray-300 dark:text-gray-300",children:[e("div",{className:"absolute left-0 right-0 top-1/2 border-b border-gray-200 dark:border-gray-600"}),e("div",{className:"relative inline-block bg-white px-2 dark:bg-gray-800",children:c.t("continue_social_login")})]}),e("div",{className:"flex space-x-4 sm:flex-col sm:space-x-0 sm:space-y-4 short:flex-row short:space-x-4 short:space-y-0",children:[k&&e(w,{connection:"facebook",text:c.t("continue_with",{provider:"Facebook"}),canResize:!0,icon:e(y,{className:"text-xl text-[#1196F5] sm:absolute sm:left-4 sm:top-1/2 sm:-translate-y-1/2 sm:text-2xl short:static short:left-auto short:top-auto short:translate-y-0 short:text-xl",name:"facebook"}),loginSession:o}),O&&e(w,{connection:"google-oauth2",text:c.t("continue_with",{provider:"Google"}),canResize:!0,icon:e(we,{className:"h-5 w-5 sm:absolute sm:left-4 sm:top-1/2 sm:h-6 sm:w-6 sm:-translate-y-1/2 short:static short:left-auto short:top-auto short:h-5 short:w-5 short:translate-y-0"}),loginSession:o}),F&&e(w,{connection:"apple",text:c.t("continue_with",{provider:"Apple"}),canResize:!0,icon:e(y,{className:"text-xl text-black dark:text-white sm:absolute sm:left-4 sm:top-1/2 sm:-translate-y-1/2 sm:text-2xl short:static short:left-auto short:top-auto short:translate-y-0 short:text-xl",name:"apple"}),loginSession:o}),E&&e(w,{connection:"vipps",text:c.t("continue_with",{provider:"Vipps"}),canResize:!0,icon:e(ve,{className:"h-5 w-5 sm:absolute sm:left-4 sm:top-1/2 sm:h-6 sm:w-6 sm:-translate-y-1/2 short:static short:left-auto short:top-auto short:h-5 short:w-5 short:translate-y-0"}),loginSession:o})]})]})]})};m.__docgenInfo={description:"",methods:[],displayName:"IdentifierPage"};const f={id:"mock-session-id",authParams:{client_id:"mock-client-id",redirect_uri:"http://localhost:3000/callback",response_type:He.CODE,scope:"openid profile email",state:"mock-state"},created_at:new Date().toISOString(),updated_at:new Date().toISOString(),expires_at:new Date(Date.now()+36e5).toISOString(),csrf_token:"mock-csrf-token",login_completed:!1},p={themeId:"mock-theme",displayName:"Default Theme",page_background:{background_color:"#ffffff",background_image_url:"",page_layout:"center"},colors:{base_focus_color:"#0066cc",base_hover_color:"#0052a3",body_text:"#333333",captcha_widget_theme:"auto",error:"#dc2626",header:"#111827",icons:"#6b7280",input_background:"#ffffff",input_border:"#d1d5db",input_filled_text:"#111827",input_labels_placeholders:"#6b7280",links_focused_components:"#0066cc",primary_button:"#0066cc",primary_button_label:"#ffffff",secondary_button_border:"#d1d5db",secondary_button_label:"#374151",success:"#16a34a",widget_background:"#ffffff",widget_border:"#e5e7eb"},borders:{button_border_radius:4,button_border_weight:1,buttons_style:"rounded",input_border_radius:4,input_border_weight:1,inputs_style:"rounded",show_widget_shadow:!0,widget_border_weight:1,widget_corner_radius:8},fonts:{title:{bold:!0,size:24},subtitle:{bold:!1,size:16},body_text:{bold:!1,size:14},buttons_text:{bold:!0,size:14},input_labels:{bold:!1,size:14},links:{bold:!1,size:14},font_url:"",links_style:"underlined",reference_text_size:14},widget:{logo_url:"https://via.placeholder.com/150",header_text_alignment:"center",logo_height:52,logo_position:"center",social_buttons_layout:"bottom"}},b={logo_url:"https://via.placeholder.com/150",colors:{primary:"#0066cc"}},_=t=>({name:"Mock Application",client_id:"mock-client-id",global:!1,is_first_party:!1,oidc_conformant:!0,sso:!1,sso_disabled:!1,cross_origin_authentication:!1,custom_login_page_on:!1,require_pushed_authorization_requests:!1,require_proof_of_possession:!1,tenant:{id:"mock-tenant-id",name:"Mock Tenant",audience:"mock-audience",sender_email:"noreply@example.com",sender_name:"Mock App",support_url:"https://example.com/support",created_at:new Date().toISOString(),updated_at:new Date().toISOString()},connections:t.map(n=>({id:`${n}-id`,name:n,strategy:n,options:{},enabled_clients:["mock-client-id"],created_at:new Date().toISOString(),updated_at:new Date().toISOString()})),callbacks:["http://localhost:3000/callback"],allowed_logout_urls:["http://localhost:3000"],web_origins:["http://localhost:3000"],client_secret:"mock-secret",created_at:new Date().toISOString(),updated_at:new Date().toISOString()}),Ue={title:"Components/IdentifierPage",component:m,parameters:{layout:"fullscreen"},tags:["autodocs"]},v={render:t=>{const n=u(m,t);return h.jsx(g,{html:n})},args:{theme:p,branding:b,loginSession:f,client:_(["email"])}},S={render:t=>h.jsx(g,{html:u(m,t)}),args:{theme:p,branding:b,loginSession:f,client:_(["email"]),error:"Invalid email address",email:"test@example.com"}},C={render:t=>h.jsx(g,{html:u(m,t)}),args:{theme:p,branding:b,loginSession:f,client:_(["sms"])}},N={render:t=>h.jsx(g,{html:u(m,t)}),args:{theme:p,branding:b,loginSession:f,client:_(["email","sms"])}},P={render:t=>h.jsx(g,{html:u(m,t)}),args:{theme:p,branding:b,loginSession:f,client:_(["email","google-oauth2"])}},I={render:t=>h.jsx(g,{html:u(m,t)}),args:{theme:p,branding:b,loginSession:f,client:_(["email","google-oauth2","facebook","apple","vipps"])}},T={render:t=>h.jsx(g,{html:u(m,t)}),args:{theme:p,branding:b,loginSession:f,client:_(["google-oauth2","facebook","apple"])}},L={render:t=>h.jsx(g,{html:u(m,t)}),args:{theme:p,branding:b,loginSession:f,client:_(["Username-Password-Authentication"])}},H={render:t=>h.jsx(g,{html:u(m,t)}),args:{theme:null,branding:null,loginSession:f,client:_(["email","google-oauth2"])}},M={render:t=>{const n=u(m,t);return h.jsx(g,{html:n})},args:{theme:{...p,themeId:"custom-theme",displayName:"Purple Theme",colors:{...p.colors,primary_button:"#7c3aed",primary_button_label:"#ffffff",links_focused_components:"#7c3aed"}},branding:{logo_url:"https://via.placeholder.com/200x60/7c3aed/ffffff?text=Custom+Logo",colors:{primary:"#7c3aed"}},loginSession:f,client:_(["email","google-oauth2","apple"])}};var A,D,V;v.parameters={...v.parameters,docs:{...(A=v.parameters)==null?void 0:A.docs,source:{originalSource:`{
  render: args => {
    const html = renderHonoComponent(IdentifierPage, args);
    return <HonoJSXWrapper html={html} />;
  },
  args: {
    theme: mockTheme,
    branding: mockBranding,
    loginSession: mockLoginSession,
    client: createMockClient(["email"])
  }
}`,...(V=(D=v.parameters)==null?void 0:D.docs)==null?void 0:V.source}}};var J,U,X;S.parameters={...S.parameters,docs:{...(J=S.parameters)==null?void 0:J.docs,source:{originalSource:`{
  render: args => <HonoJSXWrapper html={renderHonoComponent(IdentifierPage, args)} />,
  args: {
    theme: mockTheme,
    branding: mockBranding,
    loginSession: mockLoginSession,
    client: createMockClient(["email"]),
    error: "Invalid email address",
    email: "test@example.com"
  }
}`,...(X=(U=S.parameters)==null?void 0:U.docs)==null?void 0:X.source}}};var R,$,G;C.parameters={...C.parameters,docs:{...(R=C.parameters)==null?void 0:R.docs,source:{originalSource:`{
  render: args => <HonoJSXWrapper html={renderHonoComponent(IdentifierPage, args)} />,
  args: {
    theme: mockTheme,
    branding: mockBranding,
    loginSession: mockLoginSession,
    client: createMockClient(["sms"])
  }
}`,...(G=($=C.parameters)==null?void 0:$.docs)==null?void 0:G.source}}};var K,Z,Q;N.parameters={...N.parameters,docs:{...(K=N.parameters)==null?void 0:K.docs,source:{originalSource:`{
  render: args => <HonoJSXWrapper html={renderHonoComponent(IdentifierPage, args)} />,
  args: {
    theme: mockTheme,
    branding: mockBranding,
    loginSession: mockLoginSession,
    client: createMockClient(["email", "sms"])
  }
}`,...(Q=(Z=N.parameters)==null?void 0:Z.docs)==null?void 0:Q.source}}};var Y,ee,te;P.parameters={...P.parameters,docs:{...(Y=P.parameters)==null?void 0:Y.docs,source:{originalSource:`{
  render: args => <HonoJSXWrapper html={renderHonoComponent(IdentifierPage, args)} />,
  args: {
    theme: mockTheme,
    branding: mockBranding,
    loginSession: mockLoginSession,
    client: createMockClient(["email", "google-oauth2"])
  }
}`,...(te=(ee=P.parameters)==null?void 0:ee.docs)==null?void 0:te.source}}};var ne,oe,re;I.parameters={...I.parameters,docs:{...(ne=I.parameters)==null?void 0:ne.docs,source:{originalSource:`{
  render: args => <HonoJSXWrapper html={renderHonoComponent(IdentifierPage, args)} />,
  args: {
    theme: mockTheme,
    branding: mockBranding,
    loginSession: mockLoginSession,
    client: createMockClient(["email", "google-oauth2", "facebook", "apple", "vipps"])
  }
}`,...(re=(oe=I.parameters)==null?void 0:oe.docs)==null?void 0:re.source}}};var ae,se,le;T.parameters={...T.parameters,docs:{...(ae=T.parameters)==null?void 0:ae.docs,source:{originalSource:`{
  render: args => <HonoJSXWrapper html={renderHonoComponent(IdentifierPage, args)} />,
  args: {
    theme: mockTheme,
    branding: mockBranding,
    loginSession: mockLoginSession,
    client: createMockClient(["google-oauth2", "facebook", "apple"])
  }
}`,...(le=(se=T.parameters)==null?void 0:se.docs)==null?void 0:le.source}}};var ie,ce,me;L.parameters={...L.parameters,docs:{...(ie=L.parameters)==null?void 0:ie.docs,source:{originalSource:`{
  render: args => <HonoJSXWrapper html={renderHonoComponent(IdentifierPage, args)} />,
  args: {
    theme: mockTheme,
    branding: mockBranding,
    loginSession: mockLoginSession,
    client: createMockClient(["Username-Password-Authentication"])
  }
}`,...(me=(ce=L.parameters)==null?void 0:ce.docs)==null?void 0:me.source}}};var de,pe,ue;H.parameters={...H.parameters,docs:{...(de=H.parameters)==null?void 0:de.docs,source:{originalSource:`{
  render: args => <HonoJSXWrapper html={renderHonoComponent(IdentifierPage, args)} />,
  args: {
    theme: null,
    branding: null,
    loginSession: mockLoginSession,
    client: createMockClient(["email", "google-oauth2"])
  }
}`,...(ue=(pe=H.parameters)==null?void 0:pe.docs)==null?void 0:ue.source}}};var he,ge,fe;M.parameters={...M.parameters,docs:{...(he=M.parameters)==null?void 0:he.docs,source:{originalSource:`{
  render: args => {
    const html = renderHonoComponent(IdentifierPage, args);
    return <HonoJSXWrapper html={html} />;
  },
  args: {
    theme: {
      ...mockTheme,
      themeId: "custom-theme",
      displayName: "Purple Theme",
      colors: {
        ...mockTheme.colors,
        primary_button: "#7c3aed",
        primary_button_label: "#ffffff",
        links_focused_components: "#7c3aed"
      }
    },
    branding: {
      logo_url: "https://via.placeholder.com/200x60/7c3aed/ffffff?text=Custom+Logo",
      colors: {
        primary: "#7c3aed"
      }
    },
    loginSession: mockLoginSession,
    client: createMockClient(["email", "google-oauth2", "apple"])
  }
}`,...(fe=(ge=M.parameters)==null?void 0:ge.docs)==null?void 0:fe.source}}};const Xe=["EmailOnly","EmailWithError","PhoneOnly","EmailOrPhone","EmailWithGoogle","EmailWithAllSocial","SocialOnly","UsernamePassword","NoTheming","CustomColors"];export{M as CustomColors,v as EmailOnly,N as EmailOrPhone,I as EmailWithAllSocial,S as EmailWithError,P as EmailWithGoogle,H as NoTheming,C as PhoneOnly,T as SocialOnly,L as UsernamePassword,Xe as __namedExportsOrder,Ue as default};
