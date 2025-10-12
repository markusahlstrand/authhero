import{j as r,c as V,A as Ho,H as Mo,r as Ro}from"./AppLogo-gHPKz47t.js";import{i as e}from"./iframe-CdLQJ8ce.js";import{C as jo,a as Jo,b as qo,c as Wo,d as Xo,B as Uo}from"./button-D6b_BsBQ.js";import{I as Z}from"./input-DLgZLdIf.js";import{L as G}from"./label-CL6wCMJg.js";import{E as Vo}from"./ErrorMessage-C_2KfqNY.js";import{d as Zo}from"./adapter-interfaces-DorHxuyG.js";import"./preload-helper-C1FmrZbK.js";const mo=({error:t,theme:o,branding:n,loginSession:w,email:fo,className:wo})=>{var h,v,C,T,B,E,N,L,D,A,z,P,I,F,O,$,H,M,R,j,J,q,W,X,U;const y=((h=o==null?void 0:o.colors)==null?void 0:h.primary_button)||((v=n==null?void 0:n.colors)==null?void 0:v.primary)||"#0066cc",yo=((C=o==null?void 0:o.colors)==null?void 0:C.primary_button_label)||"#ffffff",k=((T=o==null?void 0:o.colors)==null?void 0:T.body_text)||"#333333",ko=((B=o==null?void 0:o.colors)==null?void 0:B.input_background)||"#ffffff",So=((E=o==null?void 0:o.colors)==null?void 0:E.input_border)||"#d1d5db",xo=((N=o==null?void 0:o.colors)==null?void 0:N.input_filled_text)||"#111827",ho=((L=o==null?void 0:o.colors)==null?void 0:L.error)||"#dc2626",vo=((D=o==null?void 0:o.colors)==null?void 0:D.widget_background)||"#ffffff",Co=((A=o==null?void 0:o.colors)==null?void 0:A.widget_border)||"#e5e7eb",To=((z=o==null?void 0:o.borders)==null?void 0:z.widget_corner_radius)||8,Bo=((P=o==null?void 0:o.borders)==null?void 0:P.input_border_radius)||4,Eo=((I=o==null?void 0:o.borders)==null?void 0:I.button_border_radius)||4,No=((F=o==null?void 0:o.borders)==null?void 0:F.show_widget_shadow)??!0,Lo=(($=(O=o==null?void 0:o.fonts)==null?void 0:O.title)==null?void 0:$.size)||24,Do=((M=(H=o==null?void 0:o.fonts)==null?void 0:H.title)==null?void 0:M.bold)??!0,Ao=((j=(R=o==null?void 0:o.fonts)==null?void 0:R.body_text)==null?void 0:j.size)||14,zo={backgroundColor:vo,borderColor:Co,borderRadius:`${To}px`,boxShadow:No?"0 1px 3px 0 rgba(0, 0, 0, 0.1)":"none",color:k},Po={fontSize:`${Lo}px`,fontWeight:Do?"700":"400",color:((J=o==null?void 0:o.colors)==null?void 0:J.header)||k},c={fontSize:`${Ao}px`,color:((q=o==null?void 0:o.colors)==null?void 0:q.input_labels_placeholders)||"#6b7280"},S={backgroundColor:ko,borderColor:t?ho:So,borderRadius:`${Bo}px`,color:xo},x={backgroundColor:y,color:yo,borderRadius:`${Eo}px`},Io={backgroundColor:((W=o==null?void 0:o.colors)==null?void 0:W.base_hover_color)||"#0052a3"},f=((X=o==null?void 0:o.widget)==null?void 0:X.logo_position)||"center",Fo=f==="left"?"text-left":f==="right"?"text-right":"text-center",Oo=((U=o==null?void 0:o.widget)==null?void 0:U.logo_url)||(n==null?void 0:n.logo_url),$o=f!=="none"&&Oo;return r("div",{className:V("flex flex-col gap-6 w-full max-w-sm",wo),children:r(jo,{style:zo,className:"border",children:[r(Jo,{children:[$o&&r("div",{className:V("mb-4",Fo),children:r(Ho,{theme:o,branding:n})}),r(qo,{style:Po,children:e.t("enter_password","Enter your password")}),r(Wo,{style:c,children:e.t("enter_password_description","Enter your password to continue")})]}),r(Xo,{children:r("form",{method:"post",children:r("div",{className:"grid gap-6",children:[r("div",{className:"grid gap-2",children:[r(G,{htmlFor:"email",style:c,children:e.t("email","Email")}),r(Z,{id:"email",name:"username",type:"email",value:fo,disabled:!0,className:"border bg-gray-50",style:{...S,cursor:"not-allowed"}})]}),r("div",{className:"grid gap-2",children:[r("div",{className:"flex items-center justify-between",children:[r(G,{htmlFor:"password",style:c,children:e.t("password","Password")}),r("a",{href:`/u/forgot-password?state=${w.id}`,className:"text-sm hover:underline",style:{color:y},children:e.t("forgot_password","Forgot password?")})]}),r("div",{className:"relative","data-password-toggle":!0,children:[r(Z,{id:"password",name:"password",type:"password","data-password-input":"password",placeholder:e.t("password_placeholder","Enter your password"),required:!0,error:!!t,className:"border pr-8",style:S}),r("button",{type:"button","data-password-toggle-btn":!0,className:"absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 transition-colors","aria-label":e.t("toggle_password_visibility","Toggle password visibility"),children:[r("svg",{"data-show-icon":!0,xmlns:"http://www.w3.org/2000/svg",width:"20",height:"20",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor","stroke-width":"2","stroke-linecap":"round","stroke-linejoin":"round",children:[r("path",{d:"M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"}),r("circle",{cx:"12",cy:"12",r:"3"})]}),r("svg",{"data-hide-icon":!0,className:"hidden",xmlns:"http://www.w3.org/2000/svg",width:"20",height:"20",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor","stroke-width":"2","stroke-linecap":"round","stroke-linejoin":"round",children:[r("path",{d:"M9.88 9.88a3 3 0 1 0 4.24 4.24"}),r("path",{d:"M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"}),r("path",{d:"M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"}),r("line",{x1:"2",x2:"22",y1:"2",y2:"22"})]})]})]}),t&&r(Vo,{children:t})]}),r(Uo,{type:"submit",className:"w-full transition-colors",style:x,onmouseover:`this.style.backgroundColor='${Io.backgroundColor}'`,onmouseout:`this.style.backgroundColor='${x.backgroundColor}'`,children:e.t("continue","Continue")}),r("div",{className:"text-center",children:r("a",{href:`/u/login/identifier?state=${w.id}`,className:"text-sm hover:underline",style:c,children:["← ",e.t("back","Back")]})})]})})})]})})};mo.__docgenInfo={description:"",methods:[],displayName:"EnterPasswordForm"};e.init({lng:"en",fallbackLng:"en",resources:{en:{translation:{enter_password:"Enter your password",enter_password_description:"Enter your password to continue",email:"Email",password:"Password",password_placeholder:"Enter your password",forgot_password:"Forgot password?",continue:"Continue",back:"Back",toggle_password_visibility:"Toggle password visibility"}}}});const nr={title:"Components/EnterPasswordForm",component:Mo,parameters:{layout:"centered",docs:{description:{component:`
# EnterPasswordForm

A modern password entry form component using shadcn/ui components with client-side password visibility toggle.

## Features

- 🎨 Fully themeable with custom colors, borders, and fonts
- 👁️ Password visibility toggle (powered by client-side hydration)
- ✅ Built-in error handling and validation
- 🔗 Forgot password link
- ⬅️ Back navigation
- 📱 Responsive design
- 🎯 Progressive enhancement - works without JavaScript

## Client-Side Enhancement

The password toggle button is enhanced with JavaScript after the page loads using Hono's JSX/DOM hydration:

1. Server renders the HTML with the toggle button
2. Client-side \`PasswordToggle\` component hydrates on load
3. Click handlers are attached via \`addEventListener\`
4. Password visibility can be toggled smoothly

The form works perfectly fine without JavaScript - the password field functions normally. The toggle is a progressive enhancement.
        `}}},tags:["autodocs"]},a={id:"mock-session-id",authParams:{client_id:"mock-client-id",redirect_uri:"http://localhost:3000/callback",response_type:Zo.CODE,scope:"openid profile email",state:"mock-state"},created_at:new Date().toISOString(),updated_at:new Date().toISOString(),expires_at:new Date(Date.now()+36e5).toISOString(),csrf_token:"mock-csrf-token",login_completed:!1},s={themeId:"mock-theme",displayName:"Default Theme",page_background:{background_color:"#f3f4f6",background_image_url:"",page_layout:"center"},colors:{base_focus_color:"#0066cc",base_hover_color:"#0052a3",body_text:"#333333",captcha_widget_theme:"auto",error:"#dc2626",header:"#111827",icons:"#6b7280",input_background:"#ffffff",input_border:"#d1d5db",input_filled_text:"#111827",input_labels_placeholders:"#6b7280",links_focused_components:"#0066cc",primary_button:"#0066cc",primary_button_label:"#ffffff",secondary_button_border:"#d1d5db",secondary_button_label:"#374151",success:"#10b981",widget_background:"#ffffff",widget_border:"#e5e7eb"},borders:{button_border_radius:4,button_border_weight:1,buttons_style:"rounded",input_border_radius:4,input_border_weight:1,inputs_style:"rounded",show_widget_shadow:!0,widget_border_weight:1,widget_corner_radius:8},fonts:{body_text:{bold:!1,size:14},buttons_text:{bold:!0,size:14},font_url:"",input_labels:{bold:!1,size:14},links:{bold:!0,size:14},links_style:"normal",reference_text_size:12,subtitle:{bold:!1,size:14},title:{bold:!0,size:24}},widget:{header_text_alignment:"center",logo_height:52,logo_position:"center",logo_url:"http://acmelogos.com/images/logo-5.svg",social_buttons_layout:"bottom"}},i={logo_url:"http://acmelogos.com/images/logo-5.svg",colors:{primary:"#0066cc"}},l={created_at:new Date().toISOString(),updated_at:new Date().toISOString(),name:"Test Application",client_id:"test-client-id",global:!1,is_first_party:!0,oidc_conformant:!0,sso:!1,sso_disabled:!1,cross_origin_authentication:!1,custom_login_page_on:!1,require_pushed_authorization_requests:!1,require_proof_of_possession:!1,tenant:{id:"test-tenant",created_at:new Date().toISOString(),updated_at:new Date().toISOString(),name:"Test Tenant",audience:"https://test-tenant.authhero.com",sender_email:"noreply@authhero.com",sender_name:"AuthHero"},connections:[]},d=t=>({html:Ro(mo,t)}),u={args:d({theme:s,branding:i,loginSession:a,email:"user@example.com",client:l})},p={args:d({theme:s,branding:i,loginSession:a,email:"user@example.com",client:l,error:"Invalid password. Please try again."})},g={args:d({theme:{...s,colors:{...s.colors,body_text:"#e5e7eb",header:"#f9fafb",input_background:"#1f2937",input_border:"#374151",input_filled_text:"#f9fafb",input_labels_placeholders:"#9ca3af",widget_background:"#111827",widget_border:"#374151",primary_button:"#3b82f6",primary_button_label:"#ffffff"}},branding:i,loginSession:a,email:"user@example.com",client:l}),parameters:{backgrounds:{default:"dark"}}},_={args:d({theme:{...s,colors:{...s.colors,primary_button:"#7c3aed",primary_button_label:"#ffffff",base_hover_color:"#6d28d9",links_focused_components:"#7c3aed"},borders:{...s.borders,button_border_radius:8,input_border_radius:8,widget_corner_radius:16}},branding:{...i,colors:{primary:"#7c3aed"}},loginSession:a,email:"user@example.com",client:l})},b={args:d({theme:{...s,widget:{...s.widget,logo_position:"none"}},branding:i,loginSession:a,email:"user@example.com",client:l})},m={args:d({theme:s,branding:i,loginSession:a,email:"very.long.email.address.that.might.overflow@subdomain.example.com",client:l})};var K,Q,Y;u.parameters={...u.parameters,docs:{...(K=u.parameters)==null?void 0:K.docs,source:{originalSource:`{
  args: createStoryArgs({
    theme: mockTheme,
    branding: mockBranding,
    loginSession: mockLoginSession,
    email: "user@example.com",
    client: mockClient
  })
}`,...(Y=(Q=u.parameters)==null?void 0:Q.docs)==null?void 0:Y.source}}};var oo,ro,eo;p.parameters={...p.parameters,docs:{...(oo=p.parameters)==null?void 0:oo.docs,source:{originalSource:`{
  args: createStoryArgs({
    theme: mockTheme,
    branding: mockBranding,
    loginSession: mockLoginSession,
    email: "user@example.com",
    client: mockClient,
    error: "Invalid password. Please try again."
  })
}`,...(eo=(ro=p.parameters)==null?void 0:ro.docs)==null?void 0:eo.source}}};var so,no,to;g.parameters={...g.parameters,docs:{...(so=g.parameters)==null?void 0:so.docs,source:{originalSource:`{
  args: createStoryArgs({
    theme: {
      ...mockTheme,
      colors: {
        ...mockTheme.colors,
        body_text: "#e5e7eb",
        header: "#f9fafb",
        input_background: "#1f2937",
        input_border: "#374151",
        input_filled_text: "#f9fafb",
        input_labels_placeholders: "#9ca3af",
        widget_background: "#111827",
        widget_border: "#374151",
        primary_button: "#3b82f6",
        primary_button_label: "#ffffff"
      }
    },
    branding: mockBranding,
    loginSession: mockLoginSession,
    email: "user@example.com",
    client: mockClient
  }),
  parameters: {
    backgrounds: {
      default: "dark"
    }
  }
}`,...(to=(no=g.parameters)==null?void 0:no.docs)==null?void 0:to.source}}};var ao,io,lo;_.parameters={..._.parameters,docs:{...(ao=_.parameters)==null?void 0:ao.docs,source:{originalSource:`{
  args: createStoryArgs({
    theme: {
      ...mockTheme,
      colors: {
        ...mockTheme.colors,
        primary_button: "#7c3aed",
        primary_button_label: "#ffffff",
        base_hover_color: "#6d28d9",
        links_focused_components: "#7c3aed"
      },
      borders: {
        ...mockTheme.borders,
        button_border_radius: 8,
        input_border_radius: 8,
        widget_corner_radius: 16
      }
    },
    branding: {
      ...mockBranding,
      colors: {
        primary: "#7c3aed"
      }
    },
    loginSession: mockLoginSession,
    email: "user@example.com",
    client: mockClient
  })
}`,...(lo=(io=_.parameters)==null?void 0:io.docs)==null?void 0:lo.source}}};var co,uo,po;b.parameters={...b.parameters,docs:{...(co=b.parameters)==null?void 0:co.docs,source:{originalSource:`{
  args: createStoryArgs({
    theme: {
      ...mockTheme,
      widget: {
        ...mockTheme.widget,
        logo_position: "none"
      }
    },
    branding: mockBranding,
    loginSession: mockLoginSession,
    email: "user@example.com",
    client: mockClient
  })
}`,...(po=(uo=b.parameters)==null?void 0:uo.docs)==null?void 0:po.source}}};var go,_o,bo;m.parameters={...m.parameters,docs:{...(go=m.parameters)==null?void 0:go.docs,source:{originalSource:`{
  args: createStoryArgs({
    theme: mockTheme,
    branding: mockBranding,
    loginSession: mockLoginSession,
    email: "very.long.email.address.that.might.overflow@subdomain.example.com",
    client: mockClient
  })
}`,...(bo=(_o=m.parameters)==null?void 0:_o.docs)==null?void 0:bo.source}}};const tr=["Default","WithError","DarkTheme","CustomBranding","NoLogo","LongEmail"];export{_ as CustomBranding,g as DarkTheme,u as Default,m as LongEmail,b as NoLogo,p as WithError,tr as __namedExportsOrder,nr as default};
