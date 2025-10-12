import{j as g}from"./jsx-runtime-BjG_zV1W.js";import{j as t,c as x,A as ke,r as h,H as f}from"./AppLogo-gHPKz47t.js";import{i as p}from"./iframe-CdLQJ8ce.js";import{E as we}from"./ErrorMessage-C_2KfqNY.js";import{g as Se}from"./index-7QM1_TBj.js";import{d as ve}from"./adapter-interfaces-DorHxuyG.js";import"./preload-helper-C1FmrZbK.js";const ue=e=>{var n,o;return t("div",{className:"mt-8",children:((o=(n=e.client)==null?void 0:n.client_metadata)==null?void 0:o.termsAndConditionsUrl)&&t("div",{className:"text-xs text-gray-300",children:[p.t("agree_to")," ",t("a",{href:e.client.client_metadata.termsAndConditionsUrl,className:"text-primary hover:underline",target:"_blank",rel:"noreferrer",children:p.t("terms")})]})})};ue.__docgenInfo={description:"",methods:[],displayName:"Footer",props:{theme:{required:!0,tsType:{name:"union",raw:"Theme | null",elements:[{name:"Theme"},{name:"null"}]},description:""},branding:{required:!0,tsType:{name:"union",raw:"Branding | null",elements:[{name:"Branding"},{name:"null"}]},description:""},client:{required:!0,tsType:{name:"union",raw:"LegacyClient | null",elements:[{name:"LegacyClient"},{name:"null"}]},description:""}}};const Ne=e=>e==="small"?"text-base":e==="medium"?"text-2xl":e==="large"?"text-3xl":"",k=({name:e,size:n,className:o=""})=>{const a=Ne(n);return t("span",{className:x(`uicon-${e}`,o,a)})};k.__docgenInfo={description:"",methods:[],displayName:"Icon",props:{name:{required:!0,tsType:{name:"string"},description:""},size:{required:!1,tsType:{name:"union",raw:'"small" | "medium" | "large"',elements:[{name:"literal",value:'"small"'},{name:"literal",value:'"medium"'},{name:"literal",value:'"large"'}]},description:""},className:{required:!1,tsType:{name:"string"},description:"",defaultValue:{value:'""',computed:!1}}}};const Pe=(e,n)=>{const o=e.replace("#",""),a=parseInt(o,16),r=a>>16&255,s=a>>8&255,i=a&255,l=Math.min(255,Math.round(r+(255-r)*n)),m=Math.min(255,Math.round(s+(255-s)*n)),w=Math.min(255,Math.round(i+(255-i)*n));return`#${(l<<16|m<<8|w).toString(16).padStart(6,"0")}`},Ce=(e,n)=>{var s,i,l,m;const o=((s=e==null?void 0:e.colors)==null?void 0:s.primary_button)||((i=n==null?void 0:n.colors)==null?void 0:i.primary)||"#000000",a=((l=e==null?void 0:e.colors)==null?void 0:l.base_hover_color)||Pe(o,.2),r=((m=e==null?void 0:e.colors)==null?void 0:m.primary_button_label)||"#ffffff";return`
    body {
      --primary-color: ${o};
      --primary-hover: ${a};
      --text-on-primary: ${r};
    }
  `},Ie="https://assets.sesamy.com/images/login-bg.jpg",ge=({title:e,children:n,theme:o,branding:a,client:r})=>{var i;const s={backgroundImage:`url(${((i=o==null?void 0:o.page_background)==null?void 0:i.background_image_url)||Ie})`};return t("html",{lang:"en",children:[t("head",{children:[t("title",{children:e}),t("meta",{charset:"UTF-8"}),t("meta",{name:"robots",content:"noindex, follow"}),t("link",{rel:"preload",href:"https://assets.sesamy.com/fonts/khteka/WOFF2/KHTeka-Regular.woff2",as:"font",type:"font/woff2",crossOrigin:"anonymous"}),t("link",{rel:"preload",href:"https://assets.sesamy.com/fonts/khteka/WOFF2/KHTeka-Medium.woff2",as:"font",type:"font/woff2",crossOrigin:"anonymous"}),t("link",{rel:"preload",href:"https://assets.sesamy.com/fonts/khteka/WOFF2/KHTeka-Bold.woff2",as:"font",type:"font/woff2",crossOrigin:"anonymous"}),t("link",{rel:"stylesheet",href:"/u/css/tailwind.css"}),t("meta",{name:"viewport",content:"width=device-width, initial-scale=1, maximum-scale=1"}),t("style",{children:Ce(o,a)}),t("meta",{name:"theme-color",content:"#000000"})]}),t("body",{children:[t("div",{className:"row min-h-full w-full overflow-hidden bg-cover bg-center text-sm sm:bg-fixed sm:bg-left-top sm:pt-16 py-2",style:s,children:t("div",{className:"row-up-left w-[calc(100%-theme(space.2)-theme(space.2))] max-w-[1295px] !flex-nowrap sm:w-[calc(100%-theme(space.16)-theme(space.16))]",children:t("div",{className:"column-left w-full sm:w-auto",children:[t("div",{className:"relative flex w-full flex-col rounded-2xl bg-white px-5 py-10 dark:bg-gray-800 dark:text-white sm:min-h-[700px] sm:max-w-md sm:px-14 sm:py-14 md:min-w-[448px] short:min-h-[558px] min-h-[calc(100vh-83px)]",children:[t("div",{className:"mb-16",children:t(ke,{theme:o,branding:a})}),t("div",{className:"flex flex-1 flex-col",children:[n,t(ue,{theme:o,branding:a,client:r})]})]}),t("div",{className:"flex w-full items-center px-6 pb-8 pt-4 justify-between",children:[t("div",{className:"flex justify-center leading-[0]",children:t("a",{href:"https://sesamy.com",target:"_blank",rel:"noreferrer",children:t(k,{name:"sesamy",className:"text-xl text-white"})})}),t("div",{className:"flex justify-center space-x-2 text-xs text-white sm:justify-normal md:text-xs"})]})]})})}),t("div",{id:"client-root"})]}),t("script",{type:"module",src:"/u/js/client.js"})]})};ge.__docgenInfo={description:"",methods:[],displayName:"Layout"};const Te=e=>e==="small"?"text-base":e==="medium"?"text-2xl":e==="large"?"text-3xl":"",he=({size:e})=>{const n=Te(e);return t("div",{className:"relative inline-block leading-[0]",children:[t(k,{className:x("text-gray-200 dark:text-[#201a41]",{[n]:n}),name:"spinner-circle"}),t(k,{className:x("absolute inset-0 animate-spin text-primary",{[n]:n}),name:"spinner-inner"})]})};he.__docgenInfo={description:"",methods:[],displayName:"Spinner",props:{size:{required:!1,tsType:{name:"union",raw:'"small" | "medium" | "large"',elements:[{name:"literal",value:'"small"'},{name:"literal",value:'"medium"'},{name:"literal",value:'"large"'}]},description:""}}};const E=({children:e,className:n,Component:o="button",variant:a="primary",href:r,disabled:s,isLoading:i,id:l})=>{const m=o==="a"?{href:r}:{};return t(o,{class:x("btn relative w-full rounded-lg text-center",{"px-4 py-5":a!=="custom","bg-primary text-textOnPrimary hover:bg-primaryHover":a==="primary","border border-gray-300 bg-white text-black":a==="secondary","pointer-events-none cursor-not-allowed opacity-40":s,"is-loading":i},"focus:outline-none focus:ring",n),type:"submit",disabled:s,id:l,...m,children:[t("span",{className:"btn-label flex items-center justify-center space-x-2",children:e}),t("div",{className:"btn-spinner absolute left-0 top-0 flex h-full w-full items-center justify-center",children:t(he,{size:"medium"})})]})};E.__docgenInfo={description:"",methods:[],displayName:"Button",props:{Component:{defaultValue:{value:'"button"',computed:!1},required:!1},variant:{defaultValue:{value:'"primary"',computed:!1},required:!1}}};const fe=({connection:e,text:n,icon:o=null,canResize:a=!1,loginSession:r})=>{const s=new URLSearchParams({client_id:r.authParams.client_id,connection:e});r.authParams.response_type&&s.set("response_type",r.authParams.response_type),r.authParams.redirect_uri&&s.set("redirect_uri",r.authParams.redirect_uri),r.authParams.scope&&s.set("scope",r.authParams.scope),r.authParams.nonce&&s.set("nonce",r.authParams.nonce),r.authParams.response_type&&s.set("response_type",r.authParams.response_type),r.authParams.state&&s.set("state",r.id);const i=`/authorize?${s.toString()}`;return t(E,{className:x("border border-gray-200 bg-white hover:bg-gray-100 dark:border-gray-400 dark:bg-black dark:hover:bg-black/90",{"px-0 py-3 sm:px-10 sm:py-4 short:px-0 short:py-3":a,"px-10 py-3":!a}),variant:"custom","aria-label":n,Component:"a",href:i,children:[o||"",t("div",{className:x("text-left text-black dark:text-white sm:text-base",{"hidden sm:inline short:hidden":a}),children:n})]})};fe.__docgenInfo={description:"",methods:[],displayName:"SocialButton",props:{connection:{required:!0,tsType:{name:"string"},description:""},icon:{required:!1,tsType:{name:"any"},description:"",defaultValue:{value:"null",computed:!1}},text:{required:!0,tsType:{name:"string"},description:""},canResize:{required:!1,tsType:{name:"boolean"},description:"",defaultValue:{value:"false",computed:!1}},loginSession:{required:!0,tsType:{name:"LoginSession"},description:""}}};const _e=({children:e,className:n})=>t("form",{id:"form",method:"post",className:n,children:e});_e.__docgenInfo={description:"",methods:[],displayName:"FormComponent"};const c=({error:e,theme:n,branding:o,loginSession:a,email:r,client:s})=>{const i=s.connections.map(({strategy:d})=>d),l=i.includes("email")||i.includes("Username-Password-Authentication"),m=i.includes("sms"),w=i.map(d=>{const S=Se(d);return S?{name:d,...S}:null}).filter(d=>d!==null),L=l||m;let be="text",ye="username";const W=l&&m?"email_or_phone_placeholder":l?"email_placeholder":"phone_placeholder";let xe=p.t(W,l&&m?"Email or Phone Number":l?"Email Address":"Phone Number");return t(ge,{title:p.t("welcome"),theme:n,branding:o,client:s,children:[t("div",{className:"mb-4 text-lg font-medium sm:text-2xl",children:p.t("welcome")}),t("div",{className:"mb-8 text-gray-300",children:p.t("login_description_template",{authMethod:p.t(W,{defaultValue:l&&m?"email or phone number":l?"email address":"phone number"}).toLocaleLowerCase(),defaultValue:"Sign in with your {{authMethod}}"})}),t("div",{className:"flex flex-1 flex-col justify-center",children:[L&&t(_e,{className:"mb-7",children:[t("input",{type:be,name:ye,placeholder:xe,className:x("mb-2 w-full rounded-lg border bg-gray-100 px-4 py-5 text-base placeholder:text-gray-300 dark:bg-gray-600 md:text-base",{"border-red":e,"border-gray-100 dark:border-gray-500":!e}),required:!0,value:r||""}),e&&t(we,{children:e}),t(E,{className:"sm:mt-4 !text-base",children:[t("span",{children:p.t("continue")}),t(k,{className:"text-xs",name:"arrow-right"})]})]}),L&&w.length>0&&t("div",{className:"relative mb-5 block text-center text-gray-300 dark:text-gray-300",children:[t("div",{className:"absolute left-0 right-0 top-1/2 border-b border-gray-200 dark:border-gray-600"}),t("div",{className:"relative inline-block bg-white px-2 dark:bg-gray-800",children:p.t("continue_social_login")})]}),t("div",{className:"flex space-x-4 sm:flex-col sm:space-x-0 sm:space-y-4 short:flex-row short:space-x-4 short:space-y-0",children:w.map(d=>{const S=d.logo;return t(fe,{connection:d.name,text:p.t("continue_with",{provider:d.displayName}),canResize:!0,icon:t(S,{className:"h-5 w-5 sm:absolute sm:left-4 sm:top-1/2 sm:h-6 sm:w-6 sm:-translate-y-1/2 short:static short:left-auto short:top-auto short:h-5 short:w-5 short:translate-y-0"}),loginSession:a},d.name)})})]})]})};c.__docgenInfo={description:"",methods:[],displayName:"IdentifierPage"};const _={id:"mock-session-id",authParams:{client_id:"mock-client-id",redirect_uri:"http://localhost:3000/callback",response_type:ve.CODE,scope:"openid profile email",state:"mock-state"},created_at:new Date().toISOString(),updated_at:new Date().toISOString(),expires_at:new Date(Date.now()+36e5).toISOString(),csrf_token:"mock-csrf-token",login_completed:!1},u={themeId:"mock-theme",displayName:"Default Theme",page_background:{background_color:"#ffffff",background_image_url:"",page_layout:"center"},colors:{base_focus_color:"#0066cc",base_hover_color:"#0052a3",body_text:"#333333",captcha_widget_theme:"auto",error:"#dc2626",header:"#111827",icons:"#6b7280",input_background:"#ffffff",input_border:"#d1d5db",input_filled_text:"#111827",input_labels_placeholders:"#6b7280",links_focused_components:"#0066cc",primary_button:"#0066cc",primary_button_label:"#ffffff",secondary_button_border:"#d1d5db",secondary_button_label:"#374151",success:"#16a34a",widget_background:"#ffffff",widget_border:"#e5e7eb"},borders:{button_border_radius:4,button_border_weight:1,buttons_style:"rounded",input_border_radius:4,input_border_weight:1,inputs_style:"rounded",show_widget_shadow:!0,widget_border_weight:1,widget_corner_radius:8},fonts:{title:{bold:!0,size:24},subtitle:{bold:!1,size:16},body_text:{bold:!1,size:14},buttons_text:{bold:!0,size:14},input_labels:{bold:!1,size:14},links:{bold:!1,size:14},font_url:"",links_style:"underlined",reference_text_size:14},widget:{logo_url:"https://via.placeholder.com/150",header_text_alignment:"center",logo_height:52,logo_position:"center",social_buttons_layout:"bottom"}},y={logo_url:"https://via.placeholder.com/150",powered_by_logo_url:"http://acmelogos.com/images/logo-5.svg",colors:{primary:"#0066cc"}},b=e=>({name:"Mock Application",client_id:"mock-client-id",global:!1,is_first_party:!1,oidc_conformant:!0,sso:!1,sso_disabled:!1,cross_origin_authentication:!1,custom_login_page_on:!1,require_pushed_authorization_requests:!1,require_proof_of_possession:!1,tenant:{id:"mock-tenant-id",name:"Mock Tenant",audience:"mock-audience",sender_email:"noreply@example.com",sender_name:"Mock App",support_url:"https://example.com/support",created_at:new Date().toISOString(),updated_at:new Date().toISOString()},connections:e.map(n=>({id:`${n}-id`,name:n,strategy:n,options:{},enabled_clients:["mock-client-id"],created_at:new Date().toISOString(),updated_at:new Date().toISOString()})),callbacks:["http://localhost:3000/callback"],allowed_logout_urls:["http://localhost:3000"],web_origins:["http://localhost:3000"],client_secret:"mock-secret",created_at:new Date().toISOString(),updated_at:new Date().toISOString()}),Be={title:"Components/IdentifierPage",component:c,parameters:{layout:"fullscreen"},tags:["autodocs"]},v={render:e=>{const n=h(c,e);return g.jsx(f,{html:n})},args:{theme:u,branding:y,loginSession:_,client:b(["email"])}},N={render:e=>g.jsx(f,{html:h(c,e)}),args:{theme:u,branding:y,loginSession:_,client:b(["email"]),error:"Invalid email address",email:"test@example.com"}},P={render:e=>g.jsx(f,{html:h(c,e)}),args:{theme:u,branding:y,loginSession:_,client:b(["sms"])}},C={render:e=>g.jsx(f,{html:h(c,e)}),args:{theme:u,branding:y,loginSession:_,client:b(["email","sms"])}},I={render:e=>g.jsx(f,{html:h(c,e)}),args:{theme:u,branding:y,loginSession:_,client:b(["email","google-oauth2"])}},T={render:e=>g.jsx(f,{html:h(c,e)}),args:{theme:u,branding:y,loginSession:_,client:b(["email","google-oauth2","facebook","apple","vipps"])}},H={render:e=>g.jsx(f,{html:h(c,e)}),args:{theme:u,branding:y,loginSession:_,client:b(["google-oauth2","facebook","apple"])}},M={render:e=>g.jsx(f,{html:h(c,e)}),args:{theme:u,branding:y,loginSession:_,client:b(["Username-Password-Authentication"])}},O={render:e=>g.jsx(f,{html:h(c,e)}),args:{theme:null,branding:null,loginSession:_,client:b(["email","google-oauth2"])}},j={render:e=>{const n=h(c,e);return g.jsx(f,{html:n})},args:{theme:{...u,themeId:"custom-theme",displayName:"Purple Theme",colors:{...u.colors,primary_button:"#7c3aed",primary_button_label:"#ffffff",links_focused_components:"#7c3aed"}},branding:{logo_url:"https://via.placeholder.com/200x60/7c3aed/ffffff?text=Custom+Logo",colors:{primary:"#7c3aed"}},loginSession:_,client:b(["email","google-oauth2","apple"])}};var q,B,D;v.parameters={...v.parameters,docs:{...(q=v.parameters)==null?void 0:q.docs,source:{originalSource:`{
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
}`,...(D=(B=v.parameters)==null?void 0:B.docs)==null?void 0:D.source}}};var A,F,z;N.parameters={...N.parameters,docs:{...(A=N.parameters)==null?void 0:A.docs,source:{originalSource:`{
  render: args => <HonoJSXWrapper html={renderHonoComponent(IdentifierPage, args)} />,
  args: {
    theme: mockTheme,
    branding: mockBranding,
    loginSession: mockLoginSession,
    client: createMockClient(["email"]),
    error: "Invalid email address",
    email: "test@example.com"
  }
}`,...(z=(F=N.parameters)==null?void 0:F.docs)==null?void 0:z.source}}};var J,X,U;P.parameters={...P.parameters,docs:{...(J=P.parameters)==null?void 0:J.docs,source:{originalSource:`{
  render: args => <HonoJSXWrapper html={renderHonoComponent(IdentifierPage, args)} />,
  args: {
    theme: mockTheme,
    branding: mockBranding,
    loginSession: mockLoginSession,
    client: createMockClient(["sms"])
  }
}`,...(U=(X=P.parameters)==null?void 0:X.docs)==null?void 0:U.source}}};var $,V,K;C.parameters={...C.parameters,docs:{...($=C.parameters)==null?void 0:$.docs,source:{originalSource:`{
  render: args => <HonoJSXWrapper html={renderHonoComponent(IdentifierPage, args)} />,
  args: {
    theme: mockTheme,
    branding: mockBranding,
    loginSession: mockLoginSession,
    client: createMockClient(["email", "sms"])
  }
}`,...(K=(V=C.parameters)==null?void 0:V.docs)==null?void 0:K.source}}};var G,R,Q;I.parameters={...I.parameters,docs:{...(G=I.parameters)==null?void 0:G.docs,source:{originalSource:`{
  render: args => <HonoJSXWrapper html={renderHonoComponent(IdentifierPage, args)} />,
  args: {
    theme: mockTheme,
    branding: mockBranding,
    loginSession: mockLoginSession,
    client: createMockClient(["email", "google-oauth2"])
  }
}`,...(Q=(R=I.parameters)==null?void 0:R.docs)==null?void 0:Q.source}}};var Y,Z,ee;T.parameters={...T.parameters,docs:{...(Y=T.parameters)==null?void 0:Y.docs,source:{originalSource:`{
  render: args => <HonoJSXWrapper html={renderHonoComponent(IdentifierPage, args)} />,
  args: {
    theme: mockTheme,
    branding: mockBranding,
    loginSession: mockLoginSession,
    client: createMockClient(["email", "google-oauth2", "facebook", "apple", "vipps"])
  }
}`,...(ee=(Z=T.parameters)==null?void 0:Z.docs)==null?void 0:ee.source}}};var te,ne,re;H.parameters={...H.parameters,docs:{...(te=H.parameters)==null?void 0:te.docs,source:{originalSource:`{
  render: args => <HonoJSXWrapper html={renderHonoComponent(IdentifierPage, args)} />,
  args: {
    theme: mockTheme,
    branding: mockBranding,
    loginSession: mockLoginSession,
    client: createMockClient(["google-oauth2", "facebook", "apple"])
  }
}`,...(re=(ne=H.parameters)==null?void 0:ne.docs)==null?void 0:re.source}}};var oe,ae,se;M.parameters={...M.parameters,docs:{...(oe=M.parameters)==null?void 0:oe.docs,source:{originalSource:`{
  render: args => <HonoJSXWrapper html={renderHonoComponent(IdentifierPage, args)} />,
  args: {
    theme: mockTheme,
    branding: mockBranding,
    loginSession: mockLoginSession,
    client: createMockClient(["Username-Password-Authentication"])
  }
}`,...(se=(ae=M.parameters)==null?void 0:ae.docs)==null?void 0:se.source}}};var ie,le,ce;O.parameters={...O.parameters,docs:{...(ie=O.parameters)==null?void 0:ie.docs,source:{originalSource:`{
  render: args => <HonoJSXWrapper html={renderHonoComponent(IdentifierPage, args)} />,
  args: {
    theme: null,
    branding: null,
    loginSession: mockLoginSession,
    client: createMockClient(["email", "google-oauth2"])
  }
}`,...(ce=(le=O.parameters)==null?void 0:le.docs)==null?void 0:ce.source}}};var me,de,pe;j.parameters={...j.parameters,docs:{...(me=j.parameters)==null?void 0:me.docs,source:{originalSource:`{
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
}`,...(pe=(de=j.parameters)==null?void 0:de.docs)==null?void 0:pe.source}}};const De=["EmailOnly","EmailWithError","PhoneOnly","EmailOrPhone","EmailWithGoogle","EmailWithAllSocial","SocialOnly","UsernamePassword","NoTheming","CustomColors"];export{j as CustomColors,v as EmailOnly,C as EmailOrPhone,T as EmailWithAllSocial,N as EmailWithError,I as EmailWithGoogle,O as NoTheming,P as PhoneOnly,H as SocialOnly,M as UsernamePassword,De as __namedExportsOrder,Be as default};
