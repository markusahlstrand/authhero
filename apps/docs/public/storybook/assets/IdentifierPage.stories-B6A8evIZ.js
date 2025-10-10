import{l as n,m as x,A as Se,E as ve,r as g,j as h,p as f}from"./AppLogo-PvKe3sco.js";import{h as Ne,g as Pe,d as Ce}from"./adapter-interfaces-DIFznudo.js";import{i as p}from"./iframe-BQT3YzO4.js";import"./preload-helper-C1FmrZbK.js";const he=e=>{var t,o;return n("div",{className:"mt-8",children:((o=(t=e.client)==null?void 0:t.client_metadata)==null?void 0:o.termsAndConditionsUrl)&&n("div",{className:"text-xs text-gray-300",children:[p.t("agree_to")," ",n("a",{href:e.client.client_metadata.termsAndConditionsUrl,className:"text-primary hover:underline",target:"_blank",rel:"noreferrer",children:p.t("terms")})]})})};he.__docgenInfo={description:"",methods:[],displayName:"Footer",props:{theme:{required:!0,tsType:{name:"union",raw:"Theme | null",elements:[{name:"Theme"},{name:"null"}]},description:""},branding:{required:!0,tsType:{name:"union",raw:"Branding | null",elements:[{name:"Branding"},{name:"null"}]},description:""},client:{required:!0,tsType:{name:"union",raw:"LegacyClient | null",elements:[{name:"LegacyClient"},{name:"null"}]},description:""}}};const Ie=e=>e==="small"?"text-base":e==="medium"?"text-2xl":e==="large"?"text-3xl":"",k=({name:e,size:t,className:o=""})=>{const a=Ie(t);return n("span",{className:x(`uicon-${e}`,o,a)})};k.__docgenInfo={description:"",methods:[],displayName:"Icon",props:{name:{required:!0,tsType:{name:"string"},description:""},size:{required:!1,tsType:{name:"union",raw:'"small" | "medium" | "large"',elements:[{name:"literal",value:'"small"'},{name:"literal",value:'"medium"'},{name:"literal",value:'"large"'}]},description:""},className:{required:!1,tsType:{name:"string"},description:"",defaultValue:{value:'""',computed:!1}}}};const Te=(e,t)=>{const o=e.replace("#",""),a=parseInt(o,16),r=a>>16&255,s=a>>8&255,i=a&255,l=Math.min(255,Math.round(r+(255-r)*t)),m=Math.min(255,Math.round(s+(255-s)*t)),w=Math.min(255,Math.round(i+(255-i)*t));return`#${(l<<16|m<<8|w).toString(16).padStart(6,"0")}`};var q=Object.freeze,Oe=Object.defineProperty,He=(e,t)=>q(Oe(e,"raw",{value:q(e.slice())})),W;const Le=(e,t)=>{var s,i,l,m;const o=((s=e==null?void 0:e.colors)==null?void 0:s.primary_button)||((i=t==null?void 0:t.colors)==null?void 0:i.primary)||"#000000",a=((l=e==null?void 0:e.colors)==null?void 0:l.base_hover_color)||Te(o,.2),r=((m=e==null?void 0:e.colors)==null?void 0:m.primary_button_label)||"#ffffff";return`
    body {
      --primary-color: ${o};
      --primary-hover: ${a};
      --text-on-primary: ${r};
    }
  `},Me="https://assets.sesamy.com/images/login-bg.jpg",fe=({title:e,children:t,theme:o,branding:a,client:r})=>{var i;const s={backgroundImage:`url(${((i=o==null?void 0:o.page_background)==null?void 0:i.background_image_url)||Me})`};return n("html",{lang:"en",children:[n("head",{children:[n("title",{children:e}),n("meta",{charset:"UTF-8"}),n("meta",{name:"robots",content:"noindex, follow"}),n("link",{rel:"preload",href:"https://assets.sesamy.com/fonts/khteka/WOFF2/KHTeka-Regular.woff2",as:"font",type:"font/woff2",crossOrigin:"anonymous"}),n("link",{rel:"preload",href:"https://assets.sesamy.com/fonts/khteka/WOFF2/KHTeka-Medium.woff2",as:"font",type:"font/woff2",crossOrigin:"anonymous"}),n("link",{rel:"preload",href:"https://assets.sesamy.com/fonts/khteka/WOFF2/KHTeka-Bold.woff2",as:"font",type:"font/woff2",crossOrigin:"anonymous"}),n("link",{rel:"stylesheet",href:"/u/css/tailwind.css"}),n("meta",{name:"viewport",content:"width=device-width, initial-scale=1, maximum-scale=1"}),n("style",{children:Le(o,a)}),n("meta",{name:"theme-color",content:"#000000"})]}),n("body",{children:n("div",{className:"row min-h-full w-full overflow-hidden bg-cover bg-center text-sm sm:bg-fixed sm:bg-left-top sm:pt-16 py-2",style:s,children:n("div",{className:"row-up-left w-[calc(100%-theme(space.2)-theme(space.2))] max-w-[1295px] !flex-nowrap sm:w-[calc(100%-theme(space.16)-theme(space.16))]",children:n("div",{className:"column-left w-full sm:w-auto",children:[n("div",{className:"relative flex w-full flex-col rounded-2xl bg-white px-5 py-10 dark:bg-gray-800 dark:text-white sm:min-h-[700px] sm:max-w-md sm:px-14 sm:py-14 md:min-w-[448px] short:min-h-[558px] min-h-[calc(100vh-83px)]",children:[n("div",{className:"mb-16",children:n(Se,{theme:o,branding:a})}),n("div",{className:"flex flex-1 flex-col",children:[t,n(he,{theme:o,branding:a,client:r})]})]}),n("div",{className:"flex w-full items-center px-6 pb-8 pt-4 justify-between",children:[n("div",{className:"flex justify-center leading-[0]",children:n("a",{href:"https://sesamy.com",target:"_blank",rel:"noreferrer",children:n(k,{name:"sesamy",className:"text-xl text-white"})})}),n("div",{className:"flex justify-center space-x-2 text-xs text-white sm:justify-normal md:text-xs"})]})]})})})}),Ne(W||(W=He([`
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
      `])))]})};fe.__docgenInfo={description:"",methods:[],displayName:"Layout"};const Ee=e=>e==="small"?"text-base":e==="medium"?"text-2xl":e==="large"?"text-3xl":"",be=({size:e})=>{const t=Ee(e);return n("div",{className:"relative inline-block leading-[0]",children:[n(k,{className:x("text-gray-200 dark:text-[#201a41]",{[t]:t}),name:"spinner-circle"}),n(k,{className:x("absolute inset-0 animate-spin text-primary",{[t]:t}),name:"spinner-inner"})]})};be.__docgenInfo={description:"",methods:[],displayName:"Spinner",props:{size:{required:!1,tsType:{name:"union",raw:'"small" | "medium" | "large"',elements:[{name:"literal",value:'"small"'},{name:"literal",value:'"medium"'},{name:"literal",value:'"large"'}]},description:""}}};const j=({children:e,className:t,Component:o="button",variant:a="primary",href:r,disabled:s,isLoading:i,id:l})=>{const m=o==="a"?{href:r}:{};return n(o,{class:x("btn relative w-full rounded-lg text-center",{"px-4 py-5":a!=="custom","bg-primary text-textOnPrimary hover:bg-primaryHover":a==="primary","border border-gray-300 bg-white text-black":a==="secondary","pointer-events-none cursor-not-allowed opacity-40":s,"is-loading":i},"focus:outline-none focus:ring",t),type:"submit",disabled:s,id:l,...m,children:[n("span",{className:"btn-label flex items-center justify-center space-x-2",children:e}),n("div",{className:"btn-spinner absolute left-0 top-0 flex h-full w-full items-center justify-center",children:n(be,{size:"medium"})})]})};j.__docgenInfo={description:"",methods:[],displayName:"Button",props:{Component:{defaultValue:{value:'"button"',computed:!1},required:!1},variant:{defaultValue:{value:'"primary"',computed:!1},required:!1}}};const _e=({connection:e,text:t,icon:o=null,canResize:a=!1,loginSession:r})=>{const s=new URLSearchParams({client_id:r.authParams.client_id,connection:e});r.authParams.response_type&&s.set("response_type",r.authParams.response_type),r.authParams.redirect_uri&&s.set("redirect_uri",r.authParams.redirect_uri),r.authParams.scope&&s.set("scope",r.authParams.scope),r.authParams.nonce&&s.set("nonce",r.authParams.nonce),r.authParams.response_type&&s.set("response_type",r.authParams.response_type),r.authParams.state&&s.set("state",r.id);const i=`/authorize?${s.toString()}`;return n(j,{className:x("border border-gray-200 bg-white hover:bg-gray-100 dark:border-gray-400 dark:bg-black dark:hover:bg-black/90",{"px-0 py-3 sm:px-10 sm:py-4 short:px-0 short:py-3":a,"px-10 py-3":!a}),variant:"custom","aria-label":t,Component:"a",href:i,children:[o||"",n("div",{className:x("text-left text-black dark:text-white sm:text-base",{"hidden sm:inline short:hidden":a}),children:t})]})};_e.__docgenInfo={description:"",methods:[],displayName:"SocialButton",props:{connection:{required:!0,tsType:{name:"string"},description:""},icon:{required:!1,tsType:{name:"any"},description:"",defaultValue:{value:"null",computed:!1}},text:{required:!0,tsType:{name:"string"},description:""},canResize:{required:!1,tsType:{name:"boolean"},description:"",defaultValue:{value:"false",computed:!1}},loginSession:{required:!0,tsType:{name:"LoginSession"},description:""}}};const ye=({children:e,className:t})=>n("form",{id:"form",method:"post",className:t,children:e});ye.__docgenInfo={description:"",methods:[],displayName:"FormComponent"};const c=({error:e,theme:t,branding:o,loginSession:a,email:r,client:s})=>{const i=s.connections.map(({strategy:d})=>d),l=i.includes("email")||i.includes("Username-Password-Authentication"),m=i.includes("sms"),w=i.map(d=>{const S=Pe(d);return S?{name:d,...S}:null}).filter(d=>d!==null),E=l||m;let xe="text",ke="username";const B=l&&m?"email_or_phone_placeholder":l?"email_placeholder":"phone_placeholder";let we=p.t(B,l&&m?"Email or Phone Number":l?"Email Address":"Phone Number");return n(fe,{title:p.t("welcome"),theme:t,branding:o,client:s,children:[n("div",{className:"mb-4 text-lg font-medium sm:text-2xl",children:p.t("welcome")}),n("div",{className:"mb-8 text-gray-300",children:p.t("login_description_template",{authMethod:p.t(B,{defaultValue:l&&m?"email or phone number":l?"email address":"phone number"}).toLocaleLowerCase(),defaultValue:"Sign in with your {{authMethod}}"})}),n("div",{className:"flex flex-1 flex-col justify-center",children:[E&&n(ye,{className:"mb-7",children:[n("input",{type:xe,name:ke,placeholder:we,className:x("mb-2 w-full rounded-lg border bg-gray-100 px-4 py-5 text-base placeholder:text-gray-300 dark:bg-gray-600 md:text-base",{"border-red":e,"border-gray-100 dark:border-gray-500":!e}),required:!0,value:r||""}),e&&n(ve,{children:e}),n(j,{className:"sm:mt-4 !text-base",children:[n("span",{children:p.t("continue")}),n(k,{className:"text-xs",name:"arrow-right"})]})]}),E&&w.length>0&&n("div",{className:"relative mb-5 block text-center text-gray-300 dark:text-gray-300",children:[n("div",{className:"absolute left-0 right-0 top-1/2 border-b border-gray-200 dark:border-gray-600"}),n("div",{className:"relative inline-block bg-white px-2 dark:bg-gray-800",children:p.t("continue_social_login")})]}),n("div",{className:"flex space-x-4 sm:flex-col sm:space-x-0 sm:space-y-4 short:flex-row short:space-x-4 short:space-y-0",children:w.map(d=>{const S=d.logo;return n(_e,{connection:d.name,text:p.t("continue_with",{provider:d.displayName}),canResize:!0,icon:n(S,{className:"h-5 w-5 sm:absolute sm:left-4 sm:top-1/2 sm:h-6 sm:w-6 sm:-translate-y-1/2 short:static short:left-auto short:top-auto short:h-5 short:w-5 short:translate-y-0"}),loginSession:a},d.name)})})]})]})};c.__docgenInfo={description:"",methods:[],displayName:"IdentifierPage"};const b={id:"mock-session-id",authParams:{client_id:"mock-client-id",redirect_uri:"http://localhost:3000/callback",response_type:Ce.CODE,scope:"openid profile email",state:"mock-state"},created_at:new Date().toISOString(),updated_at:new Date().toISOString(),expires_at:new Date(Date.now()+36e5).toISOString(),csrf_token:"mock-csrf-token",login_completed:!1},u={themeId:"mock-theme",displayName:"Default Theme",page_background:{background_color:"#ffffff",background_image_url:"",page_layout:"center"},colors:{base_focus_color:"#0066cc",base_hover_color:"#0052a3",body_text:"#333333",captcha_widget_theme:"auto",error:"#dc2626",header:"#111827",icons:"#6b7280",input_background:"#ffffff",input_border:"#d1d5db",input_filled_text:"#111827",input_labels_placeholders:"#6b7280",links_focused_components:"#0066cc",primary_button:"#0066cc",primary_button_label:"#ffffff",secondary_button_border:"#d1d5db",secondary_button_label:"#374151",success:"#16a34a",widget_background:"#ffffff",widget_border:"#e5e7eb"},borders:{button_border_radius:4,button_border_weight:1,buttons_style:"rounded",input_border_radius:4,input_border_weight:1,inputs_style:"rounded",show_widget_shadow:!0,widget_border_weight:1,widget_corner_radius:8},fonts:{title:{bold:!0,size:24},subtitle:{bold:!1,size:16},body_text:{bold:!1,size:14},buttons_text:{bold:!0,size:14},input_labels:{bold:!1,size:14},links:{bold:!1,size:14},font_url:"",links_style:"underlined",reference_text_size:14},widget:{logo_url:"https://via.placeholder.com/150",header_text_alignment:"center",logo_height:52,logo_position:"center",social_buttons_layout:"bottom"}},y={logo_url:"https://via.placeholder.com/150",powered_by_logo_url:"http://acmelogos.com/images/logo-5.svg",colors:{primary:"#0066cc"}},_=e=>({name:"Mock Application",client_id:"mock-client-id",global:!1,is_first_party:!1,oidc_conformant:!0,sso:!1,sso_disabled:!1,cross_origin_authentication:!1,custom_login_page_on:!1,require_pushed_authorization_requests:!1,require_proof_of_possession:!1,tenant:{id:"mock-tenant-id",name:"Mock Tenant",audience:"mock-audience",sender_email:"noreply@example.com",sender_name:"Mock App",support_url:"https://example.com/support",created_at:new Date().toISOString(),updated_at:new Date().toISOString()},connections:e.map(t=>({id:`${t}-id`,name:t,strategy:t,options:{},enabled_clients:["mock-client-id"],created_at:new Date().toISOString(),updated_at:new Date().toISOString()})),callbacks:["http://localhost:3000/callback"],allowed_logout_urls:["http://localhost:3000"],web_origins:["http://localhost:3000"],client_secret:"mock-secret",created_at:new Date().toISOString(),updated_at:new Date().toISOString()}),ze={title:"Components/IdentifierPage",component:c,parameters:{layout:"fullscreen"},tags:["autodocs"]},v={render:e=>{const t=g(c,e);return h.jsx(f,{html:t})},args:{theme:u,branding:y,loginSession:b,client:_(["email"])}},N={render:e=>h.jsx(f,{html:g(c,e)}),args:{theme:u,branding:y,loginSession:b,client:_(["email"]),error:"Invalid email address",email:"test@example.com"}},P={render:e=>h.jsx(f,{html:g(c,e)}),args:{theme:u,branding:y,loginSession:b,client:_(["sms"])}},C={render:e=>h.jsx(f,{html:g(c,e)}),args:{theme:u,branding:y,loginSession:b,client:_(["email","sms"])}},I={render:e=>h.jsx(f,{html:g(c,e)}),args:{theme:u,branding:y,loginSession:b,client:_(["email","google-oauth2"])}},T={render:e=>h.jsx(f,{html:g(c,e)}),args:{theme:u,branding:y,loginSession:b,client:_(["email","google-oauth2","facebook","apple","vipps"])}},O={render:e=>h.jsx(f,{html:g(c,e)}),args:{theme:u,branding:y,loginSession:b,client:_(["google-oauth2","facebook","apple"])}},H={render:e=>h.jsx(f,{html:g(c,e)}),args:{theme:u,branding:y,loginSession:b,client:_(["Username-Password-Authentication"])}},L={render:e=>h.jsx(f,{html:g(c,e)}),args:{theme:null,branding:null,loginSession:b,client:_(["email","google-oauth2"])}},M={render:e=>{const t=g(c,e);return h.jsx(f,{html:t})},args:{theme:{...u,themeId:"custom-theme",displayName:"Purple Theme",colors:{...u.colors,primary_button:"#7c3aed",primary_button_label:"#ffffff",links_focused_components:"#7c3aed"}},branding:{logo_url:"https://via.placeholder.com/200x60/7c3aed/ffffff?text=Custom+Logo",colors:{primary:"#7c3aed"}},loginSession:b,client:_(["email","google-oauth2","apple"])}};var D,z,A;v.parameters={...v.parameters,docs:{...(D=v.parameters)==null?void 0:D.docs,source:{originalSource:`{
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
}`,...(A=(z=v.parameters)==null?void 0:z.docs)==null?void 0:A.source}}};var F,J,X;N.parameters={...N.parameters,docs:{...(F=N.parameters)==null?void 0:F.docs,source:{originalSource:`{
  render: args => <HonoJSXWrapper html={renderHonoComponent(IdentifierPage, args)} />,
  args: {
    theme: mockTheme,
    branding: mockBranding,
    loginSession: mockLoginSession,
    client: createMockClient(["email"]),
    error: "Invalid email address",
    email: "test@example.com"
  }
}`,...(X=(J=N.parameters)==null?void 0:J.docs)==null?void 0:X.source}}};var U,$,V;P.parameters={...P.parameters,docs:{...(U=P.parameters)==null?void 0:U.docs,source:{originalSource:`{
  render: args => <HonoJSXWrapper html={renderHonoComponent(IdentifierPage, args)} />,
  args: {
    theme: mockTheme,
    branding: mockBranding,
    loginSession: mockLoginSession,
    client: createMockClient(["sms"])
  }
}`,...(V=($=P.parameters)==null?void 0:$.docs)==null?void 0:V.source}}};var K,R,G;C.parameters={...C.parameters,docs:{...(K=C.parameters)==null?void 0:K.docs,source:{originalSource:`{
  render: args => <HonoJSXWrapper html={renderHonoComponent(IdentifierPage, args)} />,
  args: {
    theme: mockTheme,
    branding: mockBranding,
    loginSession: mockLoginSession,
    client: createMockClient(["email", "sms"])
  }
}`,...(G=(R=C.parameters)==null?void 0:R.docs)==null?void 0:G.source}}};var Q,Y,Z;I.parameters={...I.parameters,docs:{...(Q=I.parameters)==null?void 0:Q.docs,source:{originalSource:`{
  render: args => <HonoJSXWrapper html={renderHonoComponent(IdentifierPage, args)} />,
  args: {
    theme: mockTheme,
    branding: mockBranding,
    loginSession: mockLoginSession,
    client: createMockClient(["email", "google-oauth2"])
  }
}`,...(Z=(Y=I.parameters)==null?void 0:Y.docs)==null?void 0:Z.source}}};var ee,ne,te;T.parameters={...T.parameters,docs:{...(ee=T.parameters)==null?void 0:ee.docs,source:{originalSource:`{
  render: args => <HonoJSXWrapper html={renderHonoComponent(IdentifierPage, args)} />,
  args: {
    theme: mockTheme,
    branding: mockBranding,
    loginSession: mockLoginSession,
    client: createMockClient(["email", "google-oauth2", "facebook", "apple", "vipps"])
  }
}`,...(te=(ne=T.parameters)==null?void 0:ne.docs)==null?void 0:te.source}}};var re,oe,ae;O.parameters={...O.parameters,docs:{...(re=O.parameters)==null?void 0:re.docs,source:{originalSource:`{
  render: args => <HonoJSXWrapper html={renderHonoComponent(IdentifierPage, args)} />,
  args: {
    theme: mockTheme,
    branding: mockBranding,
    loginSession: mockLoginSession,
    client: createMockClient(["google-oauth2", "facebook", "apple"])
  }
}`,...(ae=(oe=O.parameters)==null?void 0:oe.docs)==null?void 0:ae.source}}};var se,ie,le;H.parameters={...H.parameters,docs:{...(se=H.parameters)==null?void 0:se.docs,source:{originalSource:`{
  render: args => <HonoJSXWrapper html={renderHonoComponent(IdentifierPage, args)} />,
  args: {
    theme: mockTheme,
    branding: mockBranding,
    loginSession: mockLoginSession,
    client: createMockClient(["Username-Password-Authentication"])
  }
}`,...(le=(ie=H.parameters)==null?void 0:ie.docs)==null?void 0:le.source}}};var ce,me,de;L.parameters={...L.parameters,docs:{...(ce=L.parameters)==null?void 0:ce.docs,source:{originalSource:`{
  render: args => <HonoJSXWrapper html={renderHonoComponent(IdentifierPage, args)} />,
  args: {
    theme: null,
    branding: null,
    loginSession: mockLoginSession,
    client: createMockClient(["email", "google-oauth2"])
  }
}`,...(de=(me=L.parameters)==null?void 0:me.docs)==null?void 0:de.source}}};var pe,ue,ge;M.parameters={...M.parameters,docs:{...(pe=M.parameters)==null?void 0:pe.docs,source:{originalSource:`{
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
}`,...(ge=(ue=M.parameters)==null?void 0:ue.docs)==null?void 0:ge.source}}};const Ae=["EmailOnly","EmailWithError","PhoneOnly","EmailOrPhone","EmailWithGoogle","EmailWithAllSocial","SocialOnly","UsernamePassword","NoTheming","CustomColors"];export{M as CustomColors,v as EmailOnly,C as EmailOrPhone,T as EmailWithAllSocial,N as EmailWithError,I as EmailWithGoogle,L as NoTheming,P as PhoneOnly,O as SocialOnly,H as UsernamePassword,Ae as __namedExportsOrder,ze as default};
