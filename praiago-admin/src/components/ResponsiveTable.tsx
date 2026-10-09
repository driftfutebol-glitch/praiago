import { Children, cloneElement, isValidElement, type ReactNode, type ReactElement, type ComponentProps } from 'react'

type CellProps=ComponentProps<'td'> & {'data-label'?:string}
function textOf(node:ReactNode):string {
  if(typeof node==='string' || typeof node==='number') return String(node)
  if(isValidElement<{children?:ReactNode}>(node)) return textOf(node.props.children)
  return Children.toArray(node).map(textOf).join(' ')
}
function annotateRows(children:ReactNode,labels:string[]):ReactNode {
  return Children.map(children,node=>{
    if(!isValidElement<{children?:ReactNode}>(node)) return node
    // Handles Fragment/AnimatePresence/motion.tr without changing their behavior.
    const cells=Children.toArray(node.props.children)
    if(cells.some(cell=>isValidElement(cell)&&cell.type==='td')) {
      return cloneElement(node,{children:cells.map((cell,index)=>{
        if(!isValidElement<CellProps>(cell)||cell.type!=='td')return cell
        return cloneElement(cell,{'data-label':cell.props.colSpan&&cell.props.colSpan>1?'':labels[index]||''})
      })})
    }
    return node.props.children?cloneElement(node,{children:annotateRows(node.props.children,labels)}):node
  })
}
/** One table and one set of actions. CSS changes its presentation on small screens. */
export default function ResponsiveTable({children,className='',label}:{children:ReactNode;className?:string;label:string}) {
  const sections=Children.toArray(children)
  const head=sections.find(node=>isValidElement(node)&&node.type==='thead') as ReactElement<{children?:ReactNode}>|undefined
  const headerRow=Children.toArray(head?.props.children).find(isValidElement) as ReactElement<{children?:ReactNode}>|undefined
  const labels=Children.toArray(headerRow?.props.children).map(textOf)
  const body=sections.map(section=>{
    if(!isValidElement<{children?:ReactNode}>(section)||section.type!=='tbody')return section
    return cloneElement(section,{children:annotateRows(section.props.children,labels)})
  })
  return <div className="admin-table-scroll" role="region" aria-label={label} tabIndex={0}>
    <table className={`admin-responsive-table ${className}`}>{body}</table>
  </div>
}
