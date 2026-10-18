# 066 career tree: deterministic layout. y is linear in months from Jun 2021 (m=0) to today (m=64).
import math
W,TX,R=820,410,10          # width, trunk x, elbow radius
Y=lambda m:470-6.4*m
NOW=64
MON="Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split()
mon=lambda m:f"{MON[(5+m)%12]} {2021+(5+m)//12}"
TECH={"React":"var(--sky)","TypeScript":"var(--violet)",".NET":"var(--pink)","Python":"var(--amber)","Azure Functions":"#3B82F6","PostgreSQL":"var(--mint)","Go":"var(--sw-on)","AWS":"var(--coral)","Storybook":"var(--yellow)"}
# name, start, end, allocation, [(tech, proposed?)]
P=[("Contoso Portal",0,14,1.0,[("React",0),("TypeScript",0),(".NET",0)]),
   ("Northwind Claims",15,28,1.0,[("Python",0),("Azure Functions",0),("PostgreSQL",0)]),
   ("Fleet Tracker",29,NOW,.7,[("Go",0),("AWS",1),("PostgreSQL",1)]),
   ("Internal Design System",45,51,.2,[("TypeScript",0),("Storybook",0)]),
   ("Adatum claims spike",46,47,.1,[("Python",0),("AWS",0)])]
GRADES=[(0,"Associate Engineer",8),(13,"Engineer",12),(34,"Senior Engineer",16)]
CERTS=[("Azure Developer AZ-204",11,35,"Contoso Portal"),("AWS Developer Associate",37,None,"Fleet Tracker")]
ROOTS=[("Engineering","Department"),("Lumen Labs Lanka","Entity"),("Nimal Silva","Manager to Oct 2023"),("Maya Fernando","Manager since Nov 2023")]

def lanes(projects):
    """Greedy interval colouring: each project takes the side with fewer active branches, then the innermost free lane."""
    out,last=[],1
    for p in sorted(projects,key=lambda p:p[1]):
        act=[o for o in out if o[1][2]>=p[1]]
        n={s:sum(1 for o in act if o[2]==s) for s in(-1,1)}
        side=-last if n[-1]==n[1] else min(n,key=n.get); last=side
        used={o[3] for o in act if o[2]==side}
        k=next(i for i in range(1,99) if i not in used)
        out.append((len(out),p,side,k))
    return out
L=lanes(P)
assert [(s,k) for _,p,s,k in L]==[(-1,1),(1,1),(-1,1),(1,1),(-1,2)]  # Apr-May 2025: three at once, balanced 2 left, 1 right
lx=lambda s,k:TX+s*(70+(k-1)*92)

o=[]
def node(label,inner,sel=False):o.append(f'<g class="node{" sel" if sel else ""}" tabindex="0" role="button" aria-label="{label}">{inner}</g>')
# year grid
for yr in range(2022,2027):
    m=(yr-2021)*12-5; o.append(f'<line class="grid" x1="40" y1="{Y(m):.1f}" x2="{W-150}" y2="{Y(m):.1f}"/><text class="tick" x="40" y="{Y(m)-4:.1f}">{yr}</text>')
o.append(f'<text class="tick" x="40" y="{Y(0)-4:.1f}">Jun 2021</text>')
# branches
for i,(name,a,b,pct,techs),s,k in L:
    x=lx(s,k); y0,y1=Y(a),Y(b); w=1.5+4*pct
    d=f"M{TX} {y0:.1f} H{x-s*R} A{R} {R} 0 0 {0 if s>0 else 1} {x} {y0-R:.1f} V{y1:.1f}"
    fan=""
    for j,(t,prop) in enumerate(techs):
        ang=math.pi+(j+1)*math.pi/(len(techs)+1); cx,cy=x+16*math.cos(ang),y1-6+16*math.sin(ang)
        fan+=f'<line class="stem" x1="{x}" y1="{y1:.1f}" x2="{cx:.1f}" y2="{cy:.1f}"/><circle class="lf{" prop" if prop else ""}" cx="{cx:.1f}" cy="{cy:.1f}" r="5" style="fill:{TECH[t]}"><title>{t}</title></circle>'
    tx,anc=(x+s*26,"start" if s>0 else "end")
    end="today" if b==NOW else mon(b)
    node(f"Project {name}, {mon(a)} to {end}, {int(pct*100)} percent. Technologies: {', '.join(t+(' (proposed)' if p else '') for t,p in techs)}",
         f'<path class="halo" d="{d}" style="stroke-width:{w+6:.1f}"/><path class="branch" d="{d}" style="stroke-width:{w:.1f}"/>{fan}<text class="pj" x="{tx}" y="{y1+4:.1f}" text-anchor="{anc}">{name}</text><text class="sub" x="{tx}" y="{y1+17:.1f}" text-anchor="{anc}">{mon(a)} – {end}{"" if pct==1 else f" · {int(pct*100)}%"}</text>')
# trunk: width steps with grade, linear 3-month taper
pts=[]
for gi,(m,g,w) in enumerate(GRADES):
    m2=GRADES[gi+1][0] if gi+1<len(GRADES) else NOW
    pts+=[(m,w),(m2-3 if gi+1<len(GRADES) else m2,w)]
left=" ".join(f"{TX-w/2:.1f},{Y(m):.1f}" for m,w in pts); right=" ".join(f"{TX+w/2:.1f},{Y(m):.1f}" for m,w in reversed(pts))
o.append(f'<polygon class="trunk" points="{left} {right}"/>')
# rings + grade labels in the right gutter
for gi,(m,g,w) in enumerate(GRADES):
    y=Y(m); sel=gi==2
    node(f"{'Joined as' if gi==0 else 'Promoted to'} {g}, {mon(m)}{'. Selected' if sel else ''}",
         f'<line class="ring" x1="{TX-w/2-7}" y1="{y:.1f}" x2="{TX+w/2+7}" y2="{y:.1f}"/><line class="leader" x1="{TX+w/2+9}" y1="{y:.1f}" x2="{W-150}" y2="{y:.1f}"/><text class="gr" x="{W-142}" y="{y+4:.1f}">{g}</text><text class="sub" x="{W-142}" y="{y+17:.1f}">{mon(m)}</text>',sel)
# fruit: certifications sit on the branch active at issue
for name,a,exp,on in CERTS:
    _,p,s,k=next(l for l in L if l[1][0]==on); x,y=lx(s,k),Y(a)
    node(f"Certification {name}, issued {mon(a)}, "+(f"expired {mon(exp)}" if exp else "valid"),
         f'<rect class="fruit{" old" if exp else ""}" x="{x-6}" y="{y-6:.1f}" width="12" height="12" transform="rotate(45 {x} {y:.1f})"/>')
# ground + roots: equal angles in the lower half-plane
g=Y(0)+24; o.append(f'<line class="ground" x1="40" y1="{g:.1f}" x2="{W-40}" y2="{g:.1f}"/><text class="tick" x="{TX+14}" y="{Y(NOW)+4:.1f}">Today</text>')
for j,(n,sub) in enumerate(ROOTS):
    ang=math.radians(195+j*150/(len(ROOTS)-1)); x,y=TX+240*math.cos(ang),g-64*math.sin(ang)
    node(f"{n}, {sub}",f'<line class="root" x1="{TX}" y1="{g:.1f}" x2="{x:.1f}" y2="{y:.1f}"/><circle class="rn" cx="{x:.1f}" cy="{y:.1f}" r="4"/><text class="pj" x="{x:.1f}" y="{y+18:.1f}" text-anchor="middle">{n}</text><text class="sub" x="{x:.1f}" y="{y+31:.1f}" text-anchor="middle">{sub}</text>')
o.append(f'<line class="trunkroot" x1="{TX}" y1="{Y(0):.1f}" x2="{TX}" y2="{g:.1f}"/>')
H=int(g+120)
key=" ".join(f'<span class="chip"><i style="background:{c}"></i>{t}</span>' for t,c in TECH.items())
print(f'<svg class="ct" viewBox="0 18 {W} {H-18}" role="group" aria-label="Career tree for Kasun Dias, Jun 2021 to today, drawn to scale. The What changed list has the same events in date order.">\n'+"\n".join(o)+f'\n</svg>\n      <div class="tkey" aria-label="Technology colours">{key}</div>')
