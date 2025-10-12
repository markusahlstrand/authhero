import{j as a}from"./jsx-runtime-BjG_zV1W.js";import{j as o,c as Y,A as zr,H as l,r as d}from"./AppLogo-gHPKz47t.js";import{i as n}from"./iframe-CdLQJ8ce.js";import{C as Ur,a as $r,b as Hr,c as Wr,d as jr,B as K,e as Dr}from"./button-D6b_BsBQ.js";import{L as Br}from"./label-CL6wCMJg.js";import{I as Fr}from"./input-DLgZLdIf.js";import{E as Rr}from"./ErrorMessage-C_2KfqNY.js";import"./preload-helper-C1FmrZbK.js";const t=({error:e,theme:r,branding:s,state:y,user:_r,className:br})=>{var z,U,$,H,W,j,D,B,F,R,E,L,J,X,O,A,M,T,q,G,P,V;const v=((z=r==null?void 0:r.colors)==null?void 0:z.primary_button)||((U=s==null?void 0:s.colors)==null?void 0:U.primary)||"#0066cc",fr=(($=r==null?void 0:r.colors)==null?void 0:$.primary_button_label)||"#ffffff",u=((H=r==null?void 0:r.colors)==null?void 0:H.body_text)||"#333333",S=((W=r==null?void 0:r.colors)==null?void 0:W.input_border)||"#d1d5db",N=((j=r==null?void 0:r.colors)==null?void 0:j.widget_background)||"#ffffff",x=((D=r==null?void 0:r.colors)==null?void 0:D.widget_border)||"#e5e7eb",mr=((B=r==null?void 0:r.borders)==null?void 0:B.widget_corner_radius)||8,w=((F=r==null?void 0:r.borders)==null?void 0:F.button_border_radius)||4,gr=((R=r==null?void 0:r.borders)==null?void 0:R.show_widget_shadow)??!0,yr=((L=(E=r==null?void 0:r.fonts)==null?void 0:E.title)==null?void 0:L.size)||24,xr=((X=(J=r==null?void 0:r.fonts)==null?void 0:J.title)==null?void 0:X.bold)??!0,p=((A=(O=r==null?void 0:r.fonts)==null?void 0:O.body_text)==null?void 0:A.size)||14,wr={backgroundColor:N,borderColor:x,borderRadius:`${mr}px`,boxShadow:gr?"0 1px 3px 0 rgba(0, 0, 0, 0.1)":"none",color:u},kr={fontSize:`${yr}px`,fontWeight:xr?"700":"400",color:((M=r==null?void 0:r.colors)==null?void 0:M.header)||u},k={fontSize:`${p}px`,color:((T=r==null?void 0:r.colors)==null?void 0:T.input_labels_placeholders)||"#6b7280"},I={backgroundColor:v,color:fr,borderRadius:`${w}px`},Cr={backgroundColor:((q=r==null?void 0:r.colors)==null?void 0:q.base_hover_color)||"#0052a3"},vr={backgroundColor:"transparent",color:u,borderColor:S,borderRadius:`${w}px`},h={color:((G=r==null?void 0:r.colors)==null?void 0:G.links_focused_components)||v,fontSize:`${p}px`},Sr={borderColor:S,borderRadius:`${w}px`,fontSize:`${p}px`,color:u},C=((P=r==null?void 0:r.widget)==null?void 0:P.logo_position)||"center",Nr=C==="left"?"text-left":C==="right"?"text-right":"text-center",Ir=((V=r==null?void 0:r.widget)==null?void 0:V.logo_url)||(s==null?void 0:s.logo_url),hr=C!=="none"&&Ir;return o("div",{className:Y("flex flex-col gap-6 w-full max-w-sm",br),children:o(Ur,{style:wr,className:"border",children:[o($r,{children:[hr&&o("div",{className:Y("mb-4",Nr),children:o(zr,{theme:r,branding:s})}),o(Hr,{style:kr,children:n.t("impersonation","Impersonation")}),o(Wr,{style:k,children:n.t("impersonation_description","You have permission to impersonate other users.")})]}),o(jr,{children:o("div",{className:"space-y-4",children:[o("div",{className:"p-3 bg-gray-50 dark:bg-gray-800 rounded-md",children:[o("p",{className:"text-xs text-gray-500 dark:text-gray-400 mb-1",children:[n.t("current_user","Current user"),":"]}),o("p",{className:"font-semibold",style:{fontSize:`${p}px`},children:_r.email})]}),o("form",{method:"post",action:`/u/impersonate/continue?state=${encodeURIComponent(y)}`,children:o(K,{type:"submit",className:"w-full transition-colors",style:I,onmouseover:`this.style.backgroundColor='${Cr.backgroundColor}'`,onmouseout:`this.style.backgroundColor='${I.backgroundColor}'`,children:n.t("continue","Continue")})}),o("div",{className:"relative",children:[o("div",{className:"absolute inset-0 flex items-center","aria-hidden":"true",children:o("div",{className:"w-full border-t",style:{borderColor:x}})}),o("div",{className:"relative flex justify-center text-xs uppercase",children:o("span",{className:"px-2",style:{backgroundColor:N,...k},children:n.t("or","Or")})})]}),o("details",{className:"group",children:[o("summary",{className:"cursor-pointer select-none flex items-center justify-between p-3 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors",style:h,children:[o("span",{className:"font-medium",children:n.t("advanced_options","Advanced Options")}),o("svg",{className:"w-5 h-5 transition-transform group-open:rotate-90",fill:"none",stroke:"currentColor",viewBox:"0 0 24 24",children:o("path",{strokeLinecap:"round",strokeLinejoin:"round",strokeWidth:2,d:"M9 5l7 7-7 7"})})]}),o("div",{className:"mt-3 p-4 border rounded-md",style:{borderColor:x},children:o("form",{method:"post",action:`/u/impersonate/switch?state=${encodeURIComponent(y)}`,children:o("div",{className:"space-y-4",children:[o("div",{className:"space-y-2",children:[o(Br,{htmlFor:"user_id",style:k,children:n.t("user_id_to_impersonate","User ID to Impersonate")}),o(Fr,{type:"text",id:"user_id",name:"user_id",placeholder:n.t("enter_user_id","Enter user ID"),required:!0,style:Sr,className:"w-full"}),e&&o(Rr,{children:e})]}),o(K,{type:"submit",variant:"outline",className:"w-full transition-colors border",style:vr,children:n.t("impersonate_user","Impersonate User")})]})})})]})]})}),o(Dr,{children:o("a",{href:`/u/login/identifier?state=${encodeURIComponent(y)}`,className:"text-sm hover:underline focus:outline-none focus:ring-2 focus:ring-offset-2 transition-colors w-full text-center",style:h,children:n.t("go_back","Go back")})})]})})};t.__docgenInfo={description:"",methods:[],displayName:"ImpersonateForm"};const qr={title:"Components/ImpersonateForm",component:t,parameters:{layout:"centered"},tags:["autodocs"]},i={email:"admin@example.com",created_at:new Date().toISOString(),updated_at:new Date().toISOString(),user_id:"admin_user_123",provider:"email",connection:"email",is_social:!1,email_verified:!0,login_count:42},c={connections:[{name:"email",strategy:"email"}]},_={args:{state:"example_state_123",user:i,client:c,theme:null,branding:null},render:e=>a.jsx(l,{html:d(t,e)})},b={args:{state:"example_state_123",user:i,client:c,theme:null,branding:null,error:'User with ID "user_456" not found.'},render:e=>a.jsx(l,{html:d(t,e)})},f={args:{state:"example_state_123",user:{...i,email:"superadmin@company.com",user_id:"superadmin_789"},client:c,theme:null,branding:null},render:e=>a.jsx(l,{html:d(t,e)})},m={args:{state:"example_state_123",user:i,client:c,theme:{colors:{primary_button:"#7c3aed",primary_button_label:"#ffffff",body_text:"#1f2937",widget_background:"#ffffff",widget_border:"#e5e7eb",header:"#111827",input_labels_placeholders:"#6b7280",input_border:"#d1d5db",base_hover_color:"#6d28d9",links_focused_components:"#7c3aed"},fonts:{title:{bold:!0,size:28},body_text:{bold:!1,size:16}},borders:{widget_corner_radius:16,button_border_radius:8,show_widget_shadow:!0},widget:{logo_position:"center"}},branding:null},render:e=>a.jsx(l,{html:d(t,e)})},g={args:{state:"example_state_123",user:i,client:c,theme:{colors:{primary_button:"#3b82f6",primary_button_label:"#ffffff",body_text:"#e5e7eb",widget_background:"#1f2937",widget_border:"#374151",header:"#f9fafb",input_labels_placeholders:"#9ca3af",input_border:"#4b5563",base_hover_color:"#2563eb",links_focused_components:"#60a5fa"},fonts:{title:{bold:!0,size:24},body_text:{bold:!1,size:14}},borders:{widget_corner_radius:8,button_border_radius:4,show_widget_shadow:!0},widget:{logo_position:"center"}},branding:null},parameters:{backgrounds:{default:"dark"}},render:e=>a.jsx(l,{html:`<div class="dark bg-gray-900 p-8">${d(t,e)}</div>`})};var Q,Z,rr;_.parameters={..._.parameters,docs:{...(Q=_.parameters)==null?void 0:Q.docs,source:{originalSource:`{
  args: {
    state: "example_state_123",
    user: mockUser,
    client: mockClient,
    theme: null,
    branding: null
  },
  render: args => <HonoJSXWrapper html={renderHonoComponent(ImpersonateForm, args)} />
}`,...(rr=(Z=_.parameters)==null?void 0:Z.docs)==null?void 0:rr.source}}};var or,er,nr;b.parameters={...b.parameters,docs:{...(or=b.parameters)==null?void 0:or.docs,source:{originalSource:`{
  args: {
    state: "example_state_123",
    user: mockUser,
    client: mockClient,
    theme: null,
    branding: null,
    error: 'User with ID "user_456" not found.'
  },
  render: args => <HonoJSXWrapper html={renderHonoComponent(ImpersonateForm, args)} />
}`,...(nr=(er=b.parameters)==null?void 0:er.docs)==null?void 0:nr.source}}};var sr,tr,ar;f.parameters={...f.parameters,docs:{...(sr=f.parameters)==null?void 0:sr.docs,source:{originalSource:`{
  args: {
    state: "example_state_123",
    user: {
      ...mockUser,
      email: "superadmin@company.com",
      user_id: "superadmin_789"
    },
    client: mockClient,
    theme: null,
    branding: null
  },
  render: args => <HonoJSXWrapper html={renderHonoComponent(ImpersonateForm, args)} />
}`,...(ar=(tr=f.parameters)==null?void 0:tr.docs)==null?void 0:ar.source}}};var lr,dr,ir;m.parameters={...m.parameters,docs:{...(lr=m.parameters)==null?void 0:lr.docs,source:{originalSource:`{
  args: {
    state: "example_state_123",
    user: mockUser,
    client: mockClient,
    theme: {
      colors: {
        primary_button: "#7c3aed",
        primary_button_label: "#ffffff",
        body_text: "#1f2937",
        widget_background: "#ffffff",
        widget_border: "#e5e7eb",
        header: "#111827",
        input_labels_placeholders: "#6b7280",
        input_border: "#d1d5db",
        base_hover_color: "#6d28d9",
        links_focused_components: "#7c3aed"
      },
      fonts: {
        title: {
          bold: true,
          size: 28
        },
        body_text: {
          bold: false,
          size: 16
        }
      },
      borders: {
        widget_corner_radius: 16,
        button_border_radius: 8,
        show_widget_shadow: true
      },
      widget: {
        logo_position: "center"
      }
    } as any,
    branding: null
  },
  render: args => <HonoJSXWrapper html={renderHonoComponent(ImpersonateForm, args)} />
}`,...(ir=(dr=m.parameters)==null?void 0:dr.docs)==null?void 0:ir.source}}};var cr,ur,pr;g.parameters={...g.parameters,docs:{...(cr=g.parameters)==null?void 0:cr.docs,source:{originalSource:`{
  args: {
    state: "example_state_123",
    user: mockUser,
    client: mockClient,
    theme: {
      colors: {
        primary_button: "#3b82f6",
        primary_button_label: "#ffffff",
        body_text: "#e5e7eb",
        widget_background: "#1f2937",
        widget_border: "#374151",
        header: "#f9fafb",
        input_labels_placeholders: "#9ca3af",
        input_border: "#4b5563",
        base_hover_color: "#2563eb",
        links_focused_components: "#60a5fa"
      },
      fonts: {
        title: {
          bold: true,
          size: 24
        },
        body_text: {
          bold: false,
          size: 14
        }
      },
      borders: {
        widget_corner_radius: 8,
        button_border_radius: 4,
        show_widget_shadow: true
      },
      widget: {
        logo_position: "center"
      }
    } as any,
    branding: null
  },
  parameters: {
    backgrounds: {
      default: "dark"
    }
  },
  render: args => <HonoJSXWrapper html={\`<div class="dark bg-gray-900 p-8">\${renderHonoComponent(ImpersonateForm, args)}</div>\`} />
}`,...(pr=(ur=g.parameters)==null?void 0:ur.docs)==null?void 0:pr.source}}};const Gr=["Default","WithError","WithCustomUser","WithTheming","DarkMode"];export{g as DarkMode,_ as Default,f as WithCustomUser,b as WithError,m as WithTheming,Gr as __namedExportsOrder,qr as default};
