import yaml
import sys

def fix_workflow():
    with open('dify_workflow_temp.yml', 'r') as f:
        data = yaml.safe_load(f)

    edges = data['workflow']['graph']['edges']
    nodes = data['workflow']['graph']['nodes']

    # Remove node 1779879845773 (Code: Base64) and 1779880184091 (HTTP: GitHub)
    nodes = [n for n in nodes if n['id'] not in ['1779879845773', '1779880184091']]

    # Remove edges connected to them
    edges = [e for e in edges if e['source'] not in ['1779879845773', '1779880184091'] and e['target'] not in ['1779879845773', '1779880184091']]

    # Add End node
    end_node = {
        'data': {
            'outputs': [
                {
                    'value_selector': ['1779879152457', 'output'],
                    'value_type': 'string',
                    'variable': 'text'
                }
            ],
            'selected': False,
            'title': '記事出力（終了）',
            'type': 'end'
        },
        'height': 88,
        'id': '1780000000000',
        'position': {'x': 2300, 'y': 303},
        'positionAbsolute': {'x': 2300, 'y': 303},
        'selected': False,
        'sourcePosition': 'right',
        'targetPosition': 'left',
        'type': 'custom',
        'width': 242
    }
    nodes.append(end_node)

    # Add edge from 1779879152457 to 1780000000000
    end_edge = {
        'data': {
            'isInIteration': False,
            'isInLoop': False,
            'sourceType': 'template-transform',
            'targetType': 'end'
        },
        'id': '1779879152457-source-1780000000000-target',
        'selected': False,
        'source': '1779879152457',
        'sourceHandle': 'source',
        'target': '1780000000000',
        'targetHandle': 'target',
        'type': 'custom',
        'zIndex': 0
    }
    edges.append(end_edge)

    data['workflow']['graph']['nodes'] = nodes
    data['workflow']['graph']['edges'] = edges

    with open('blog/dify_fixed_workflow.yml', 'w') as f:
        yaml.dump(data, f, allow_unicode=True, sort_keys=False)
    print("Fixed workflow saved to blog/dify_fixed_workflow.yml")

if __name__ == "__main__":
    fix_workflow()
