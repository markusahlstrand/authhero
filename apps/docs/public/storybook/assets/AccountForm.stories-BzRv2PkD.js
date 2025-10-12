import{j as l}from"./jsx-runtime-BjG_zV1W.js";import{j as r,c as q,A as De,H as i,r as d}from"./AppLogo-gHPKz47t.js";import{i as t}from"./iframe-CdLQJ8ce.js";import{C as Je,a as Xe,b as Be,c as Re,d as Ie,B as Me}from"./button-D6b_BsBQ.js";import{E as Pe}from"./ErrorMessage-C_2KfqNY.js";import"./preload-helper-C1FmrZbK.js";const s=({error:o,success:A,theme:e,branding:a,state:C,user:m,client:ke,className:he,showLinkedAccounts:xe=!1})=>{var N,W,z,H,U,j,E,$,F,D,J,X,B,R,I,M,P,T,O,V;const ye=((N=e==null?void 0:e.colors)==null?void 0:N.primary_button)||((W=a==null?void 0:a.colors)==null?void 0:W.primary)||"#0066cc",_=((z=e==null?void 0:e.colors)==null?void 0:z.body_text)||"#333333",we=((H=e==null?void 0:e.colors)==null?void 0:H.widget_background)||"#ffffff",g=((U=e==null?void 0:e.colors)==null?void 0:U.widget_border)||"#e5e7eb",ve=((j=e==null?void 0:e.borders)==null?void 0:j.widget_corner_radius)||8,Se=((E=e==null?void 0:e.borders)==null?void 0:E.button_border_radius)||4,Ae=(($=e==null?void 0:e.borders)==null?void 0:$.show_widget_shadow)??!0,Ce=((D=(F=e==null?void 0:e.fonts)==null?void 0:F.title)==null?void 0:D.size)||24,Le=((X=(J=e==null?void 0:e.fonts)==null?void 0:J.title)==null?void 0:X.bold)??!0,p=((R=(B=e==null?void 0:e.fonts)==null?void 0:B.body_text)==null?void 0:R.size)||14,Ne={backgroundColor:we,borderColor:g,borderRadius:`${ve}px`,boxShadow:Ae?"0 1px 3px 0 rgba(0, 0, 0, 0.1)":"none",color:_},We={fontSize:`${Ce}px`,fontWeight:Le?"700":"400",color:((I=e==null?void 0:e.colors)==null?void 0:I.header)||_},b={fontSize:`${p}px`,color:((M=e==null?void 0:e.colors)==null?void 0:M.input_labels_placeholders)||"#6b7280"},ze={color:((P=e==null?void 0:e.colors)==null?void 0:P.links_focused_components)||ye,fontSize:`${p}px`},He={color:"#10b981",fontSize:`${p}px`},S=((T=e==null?void 0:e.widget)==null?void 0:T.logo_position)||"center",Ue=S==="left"?"text-left":S==="right"?"text-right":"text-center",je=((O=e==null?void 0:e.widget)==null?void 0:O.logo_url)||(a==null?void 0:a.logo_url),Ee=S!=="none"&&je,L=((V=m.identities)==null?void 0:V.filter(n=>!(n.provider===m.provider&&n.user_id===m.user_id.split("|")[1])))||[],$e=C?`/u/account/change-email?state=${encodeURIComponent(C)}`:`/u/account/change-email?client_id=${encodeURIComponent(ke.client_id)}`;return r("div",{className:q("flex flex-col gap-6 w-full max-w-md",he),children:r(Je,{style:Ne,className:"border",children:[r(Xe,{children:[Ee&&r("div",{className:q("mb-4",Ue),children:r(De,{theme:e,branding:a})}),r(Be,{style:We,children:t.t("account_title","Account Settings")}),r(Re,{style:b,children:t.t("account_page_description","Manage your account information and settings")})]}),r(Ie,{children:r("div",{className:"space-y-6",children:[o&&r(Pe,{children:o}),A&&r("div",{className:"p-3 bg-green-50 dark:bg-green-900/20 rounded-md",style:He,children:A}),r("div",{className:"space-y-3",children:r("div",{className:"flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-md border",style:{borderColor:g},children:[r("div",{className:"flex-1 min-w-0 mr-4",children:[r("div",{className:"text-xs mb-1",style:b,children:t.t("email_placeholder","Email")}),r("div",{className:"font-medium truncate",style:{fontSize:`${p}px`,color:_},children:m.email||t.t("no_email_address","No email address")})]}),r("a",{href:$e,className:"flex-shrink-0 p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-md transition-colors",title:t.t("edit","Edit"),"aria-label":t.t("edit","Edit"),style:{borderRadius:`${Se}px`},children:r("svg",{className:"w-5 h-5",fill:"none",stroke:"currentColor",viewBox:"0 0 24 24",style:{color:ze.color},children:r("path",{strokeLinecap:"round",strokeLinejoin:"round",strokeWidth:2,d:"M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"})})})]})}),xe&&L.length>0&&r("div",{className:"space-y-3",children:r("div",{className:"border-t pt-4",style:{borderColor:g},children:[r("div",{className:"text-sm mb-3",style:b,children:t.t("linked_accounts","Linked Accounts")}),r("div",{className:"space-y-2",children:L.map((n,Fe)=>{var Y;return r("div",{className:"flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-md border",style:{borderColor:g},children:[r("div",{className:"flex-1 min-w-0 mr-4",children:[r("div",{className:"text-xs mb-1",style:b,children:n.provider==="google-oauth2"?"Google":n.provider}),r("div",{className:"font-medium truncate",style:{fontSize:`${p}px`,color:_},children:((Y=n.profileData)==null?void 0:Y.email)||n.user_id})]}),r("form",{method:"post",className:"flex-shrink-0",children:[r("input",{type:"hidden",name:"action",value:"unlink_account"}),r("input",{type:"hidden",name:"provider",value:n.provider}),r("input",{type:"hidden",name:"user_id",value:n.user_id}),r(Me,{type:"submit",variant:"outline",className:"text-xs px-3 py-1.5 border-red-300 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/20",children:t.t("unlink","Unlink")})]})]},`linked-identity-${Fe}`)})})]})})]})})]})})};s.__docgenInfo={description:"",methods:[],displayName:"AccountForm",props:{showLinkedAccounts:{defaultValue:{value:"false",computed:!1},required:!1}}};const Ke={title:"Components/AccountForm",component:s,parameters:{layout:"centered"},tags:["autodocs"]},u={email:"user@example.com",created_at:new Date().toISOString(),updated_at:new Date().toISOString(),user_id:"auth2|user_123",provider:"auth2",connection:"Username-Password-Authentication",is_social:!1,email_verified:!0,login_count:15},fe={...u,identities:[{provider:"auth2",user_id:"user_123",connection:"Username-Password-Authentication",isSocial:!1},{provider:"google-oauth2",user_id:"google_123456",connection:"google-oauth2",isSocial:!0,profileData:{email:"user@gmail.com"}},{provider:"github",user_id:"github_789",connection:"github",isSocial:!0,profileData:{email:"user@github-account.com"}}]},c={client_id:"client_123",connections:[{name:"email",strategy:"email"}]},f={args:{state:"example_state_123",user:u,client:c,theme:null,branding:null,showLinkedAccounts:!1},render:o=>l.jsx(i,{html:d(s,o)})},k={args:{state:"example_state_123",user:u,client:c,theme:null,branding:null,showLinkedAccounts:!1,success:"Your email has been updated successfully!"},render:o=>l.jsx(i,{html:d(s,o)})},h={args:{state:"example_state_123",user:u,client:c,theme:null,branding:null,showLinkedAccounts:!1,error:"Failed to update email. Please try again."},render:o=>l.jsx(i,{html:d(s,o)})},x={args:{state:"example_state_123",user:fe,client:c,theme:null,branding:null,showLinkedAccounts:!0},render:o=>l.jsx(i,{html:d(s,o)})},y={args:{state:"example_state_123",user:{...u,email:"very.long.email.address.for.testing@example-company-domain.com"},client:c,theme:null,branding:null,showLinkedAccounts:!1},render:o=>l.jsx(i,{html:d(s,o)})},w={args:{state:"example_state_123",user:u,client:c,theme:{colors:{primary_button:"#7c3aed",primary_button_label:"#ffffff",body_text:"#1f2937",widget_background:"#ffffff",widget_border:"#e5e7eb",header:"#111827",input_labels_placeholders:"#6b7280",input_border:"#d1d5db",base_hover_color:"#6d28d9",links_focused_components:"#7c3aed"},fonts:{title:{bold:!0,size:28},body_text:{bold:!1,size:16}},borders:{widget_corner_radius:16,button_border_radius:8,show_widget_shadow:!0},widget:{logo_position:"center"}},branding:null,showLinkedAccounts:!1},render:o=>l.jsx(i,{html:d(s,o)})},v={args:{state:"example_state_123",user:fe,client:c,theme:{colors:{primary_button:"#3b82f6",primary_button_label:"#ffffff",body_text:"#e5e7eb",widget_background:"#1f2937",widget_border:"#374151",header:"#f9fafb",input_labels_placeholders:"#9ca3af",input_border:"#4b5563",base_hover_color:"#2563eb",links_focused_components:"#60a5fa"},fonts:{title:{bold:!0,size:24},body_text:{bold:!1,size:14}},borders:{widget_corner_radius:8,button_border_radius:4,show_widget_shadow:!0},widget:{logo_position:"center"}},branding:null,showLinkedAccounts:!0},parameters:{backgrounds:{default:"dark"}},render:o=>l.jsx(i,{html:`<div class="dark bg-gray-900 p-8">${d(s,o)}</div>`})};var G,K,Q;f.parameters={...f.parameters,docs:{...(G=f.parameters)==null?void 0:G.docs,source:{originalSource:`{
  args: {
    state: "example_state_123",
    user: mockUser,
    client: mockClient,
    theme: null,
    branding: null,
    showLinkedAccounts: false
  },
  render: args => <HonoJSXWrapper html={renderHonoComponent(AccountForm, args)} />
}`,...(Q=(K=f.parameters)==null?void 0:K.docs)==null?void 0:Q.source}}};var Z,ee,re;k.parameters={...k.parameters,docs:{...(Z=k.parameters)==null?void 0:Z.docs,source:{originalSource:`{
  args: {
    state: "example_state_123",
    user: mockUser,
    client: mockClient,
    theme: null,
    branding: null,
    showLinkedAccounts: false,
    success: "Your email has been updated successfully!"
  },
  render: args => <HonoJSXWrapper html={renderHonoComponent(AccountForm, args)} />
}`,...(re=(ee=k.parameters)==null?void 0:ee.docs)==null?void 0:re.source}}};var oe,ne,se;h.parameters={...h.parameters,docs:{...(oe=h.parameters)==null?void 0:oe.docs,source:{originalSource:`{
  args: {
    state: "example_state_123",
    user: mockUser,
    client: mockClient,
    theme: null,
    branding: null,
    showLinkedAccounts: false,
    error: "Failed to update email. Please try again."
  },
  render: args => <HonoJSXWrapper html={renderHonoComponent(AccountForm, args)} />
}`,...(se=(ne=h.parameters)==null?void 0:ne.docs)==null?void 0:se.source}}};var te,ae,le;x.parameters={...x.parameters,docs:{...(te=x.parameters)==null?void 0:te.docs,source:{originalSource:`{
  args: {
    state: "example_state_123",
    user: mockUserWithLinkedAccounts,
    client: mockClient,
    theme: null,
    branding: null,
    showLinkedAccounts: true
  },
  render: args => <HonoJSXWrapper html={renderHonoComponent(AccountForm, args)} />
}`,...(le=(ae=x.parameters)==null?void 0:ae.docs)==null?void 0:le.source}}};var ie,de,ce;y.parameters={...y.parameters,docs:{...(ie=y.parameters)==null?void 0:ie.docs,source:{originalSource:`{
  args: {
    state: "example_state_123",
    user: {
      ...mockUser,
      email: "very.long.email.address.for.testing@example-company-domain.com"
    },
    client: mockClient,
    theme: null,
    branding: null,
    showLinkedAccounts: false
  },
  render: args => <HonoJSXWrapper html={renderHonoComponent(AccountForm, args)} />
}`,...(ce=(de=y.parameters)==null?void 0:de.docs)==null?void 0:ce.source}}};var ue,pe,me;w.parameters={...w.parameters,docs:{...(ue=w.parameters)==null?void 0:ue.docs,source:{originalSource:`{
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
    branding: null,
    showLinkedAccounts: false
  },
  render: args => <HonoJSXWrapper html={renderHonoComponent(AccountForm, args)} />
}`,...(me=(pe=w.parameters)==null?void 0:pe.docs)==null?void 0:me.source}}};var _e,ge,be;v.parameters={...v.parameters,docs:{...(_e=v.parameters)==null?void 0:_e.docs,source:{originalSource:`{
  args: {
    state: "example_state_123",
    user: mockUserWithLinkedAccounts,
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
    branding: null,
    showLinkedAccounts: true
  },
  parameters: {
    backgrounds: {
      default: "dark"
    }
  },
  render: args => <HonoJSXWrapper html={\`<div class="dark bg-gray-900 p-8">\${renderHonoComponent(AccountForm, args)}</div>\`} />
}`,...(be=(ge=v.parameters)==null?void 0:ge.docs)==null?void 0:be.source}}};const Qe=["Default","WithSuccess","WithError","WithLinkedAccounts","WithLongEmail","WithTheming","DarkMode"];export{v as DarkMode,f as Default,h as WithError,x as WithLinkedAccounts,y as WithLongEmail,k as WithSuccess,w as WithTheming,Qe as __namedExportsOrder,Ke as default};
